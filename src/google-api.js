// ─── Google Calendar API Client (main process) ──────────────────
const { google } = require('googleapis');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Lazy-loaded Electron references (not ready at require-time)
var _app = null;
var _shell = null;
function getApp() { return _app || require('electron').app; }
function getShell() { return _shell || require('electron').shell; }
function getTokenPath() {
  return path.join(getApp().getPath('userData'), 'data', 'google-tokens.json');
}

// ─── Constants ───────────────────────────────────────────────────
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const PORT_RANGE = [3000, 3010];
const AUTH_TIMEOUT = 120000; // 2 minutes for user to complete OAuth

// Google Calendar color IDs (1-11) mapped to approximate hex values
// Our app uses 8 colors; Google has 11 named colors
const GOOGLE_COLOR_MAP = {
  // Google colorId -> our hex
  1: '#7986CB',   // Lavender
  2: '#33B679',   // Sage (Green)
  3: '#8E24AA',   // Grape (Purple)
  4: '#E67C73',   // Flamingo (Pink)
  5: '#F6BF26',   // Banana (Yellow)
  6: '#F4511E',   // Tangerine (Orange)
  7: '#039BE5',   // Peacock (Blue)
  8: '#616161',   // Graphite (Gray)
  9: '#3F51B5',   // Blueberry (Indigo)
  10: '#0B8043',  // Basil (Dark Green)
  11: '#D50000',  // Tomato (Red)
};

// Reverse map: our hex -> closest Google colorId
const APP_COLORS = [
  '#FF3B30', // Red    → Google 11 (Tomato)
  '#FF9500', // Orange → Google 6 (Tangerine)
  '#FFCC00', // Yellow → Google 5 (Banana)
  '#34C759', // Green  → Google 2 (Sage)
  '#007AFF', // Blue   → Google 7 (Peacock)
  '#AF52DE', // Purple → Google 3 (Grape)
  '#8E8E93', // Gray   → Google 8 (Graphite)
  '#5AC8FA', // Cyan   → Google 7 (Peacock) — closest
];

const APP_TO_GOOGLE_COLOR = {};
APP_COLORS.forEach((hex, i) => {
  // Simple mapping: use the most similar Google color
  const mapping = [11, 6, 5, 2, 7, 3, 8, 7];
  APP_TO_GOOGLE_COLOR[hex] = mapping[i] || 1;
});

function appHexToGoogleColorId(hex) {
  return APP_TO_GOOGLE_COLOR[hex] || 1;
}

function googleColorIdToHex(colorId) {
  return GOOGLE_COLOR_MAP[colorId] || '#007AFF';
}

// ─── Module State ────────────────────────────────────────────────
let oauth2Client = null;
let calendarClient = null;
let authStatus = { connected: false, email: null };

// ─── Token Persistence ───────────────────────────────────────────
function ensureDataDir() {
  const dir = path.join(getApp().getPath('userData'), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadTokens() {
  ensureDataDir();
  try {
    if (fs.existsSync(getTokenPath())) {
      return JSON.parse(fs.readFileSync(getTokenPath(), 'utf-8'));
    }
  } catch (_) { /* corrupt, ignore */ }
  return null;
}

function saveTokens(tokens) {
  ensureDataDir();
  try {
    fs.writeFileSync(getTokenPath(), JSON.stringify(tokens, null, 2), 'utf-8');
  } catch (e) {
    console.error('[GoogleAPI] Failed to save tokens:', e.message);
  }
}

function clearTokens() {
  try {
    if (fs.existsSync(getTokenPath())) fs.unlinkSync(getTokenPath());
  } catch (_) {}
}

// ─── OAuth2 Client Setup ─────────────────────────────────────────
function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.log('[GoogleAPI] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set');
    return null;
  }
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost' // placeholder, will be set with actual port
  );
}

// ─── Init ────────────────────────────────────────────────────────
const GoogleAPI = {
  init: function () {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return;

    oauth2Client = createOAuthClient();
    if (!oauth2Client) return;

    const savedTokens = loadTokens();
    if (savedTokens) {
      oauth2Client.setCredentials(savedTokens);
      // Set up auto-refresh listener
      oauth2Client.on('tokens', (newTokens) => {
        if (newTokens.refresh_token) {
          savedTokens.refresh_token = newTokens.refresh_token;
        }
        savedTokens.access_token = newTokens.access_token;
        savedTokens.expiry_date = newTokens.expiry_date;
        saveTokens(savedTokens);
      });
      calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });
      // Verify token validity
      this._verifyConnection();
    }
  },

  _verifyConnection: async function () {
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const res = await oauth2.userinfo.get();
      authStatus = { connected: true, email: res.data.email };
      console.log('[GoogleAPI] Connected as', res.data.email);
    } catch (e) {
      console.log('[GoogleAPI] Token invalid:', e.message);
      authStatus = { connected: false, email: null };
      clearTokens();
    }
  },

  // ─── OAuth Flow ────────────────────────────────────────────────
  startAuth: function () {
    return new Promise((resolve, reject) => {
      if (!oauth2Client) {
        return reject(new Error('OAuth client not configured. Check GOOGLE_CLIENT_ID in .env'));
      }

      // Find a free port
      let port = PORT_RANGE[0];
      const tryPort = (p) => {
        if (p > PORT_RANGE[1]) return reject(new Error('No free port available'));
        const server = http.createServer();
        server.listen(p, '127.0.0.1', () => {
          port = p;
          server.close();
          startAuthServer(p);
        });
        server.on('error', () => tryPort(p + 1));
      };

      const startAuthServer = (port) => {
        const redirectUri = `http://localhost:${port}`;
        oauth2Client.redirectUri = redirectUri;

        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
          prompt: 'consent', // force refresh_token
        });

        const server = http.createServer(async (req, res) => {
          try {
            const url = new URL(req.url, `http://localhost:${port}`);
            const code = url.searchParams.get('code');

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<html><body style="font-family:sans-serif;padding:40px;"><h2>授权失败</h2><p>未收到授权码，请重试。</p></body></html>');
              server.close();
              return reject(new Error('No authorization code received'));
            }

            // Exchange code for tokens
            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);

            // Set up auto-refresh
            oauth2Client.on('tokens', (newTokens) => {
              const current = loadTokens() || {};
              if (newTokens.refresh_token) current.refresh_token = newTokens.refresh_token;
              current.access_token = newTokens.access_token;
              current.expiry_date = newTokens.expiry_date;
              saveTokens(current);
            });

            saveTokens(tokens);
            calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });

            // Get user email
            try {
              const oauth2api = google.oauth2({ version: 'v2', auth: oauth2Client });
              const info = await oauth2api.userinfo.get();
              authStatus = { connected: true, email: info.data.email };
            } catch (_) {
              authStatus = { connected: true, email: null };
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body style="font-family:sans-serif;padding:40px;text-align:center;">'
              + '<h2>✓ 授权成功</h2><p>已连接 Google 账号</p>'
              + '<p style="color:#888;">可以关闭此页面</p></body></html>');
            server.close();
            resolve({ connected: true, email: authStatus.email });
          } catch (e) {
            console.error('[GoogleAPI] Token exchange error:', e);
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body style="font-family:sans-serif;padding:40px;"><h2>授权失败</h2><p>' + e.message + '</p></body></html>');
            server.close();
            reject(e);
          }
        });

        // Timeout for auth flow
        const timeout = setTimeout(() => {
          server.close();
          reject(new Error('授权超时，请重试'));
        }, AUTH_TIMEOUT);

        // Clean up timeout when server closes
        server.on('close', () => clearTimeout(timeout));

        server.listen(port, '127.0.0.1', () => {
          console.log('[GoogleAPI] OAuth server listening on port', port);
          getShell().openExternal(authUrl);
        });

        server.on('error', (e) => {
          clearTimeout(timeout);
          reject(e);
        });
      };

      tryPort(PORT_RANGE[0]);
    });
  },

  // ─── Status ────────────────────────────────────────────────────
  getStatus: async function () {
    // Re-verify if we think we're connected
    if (authStatus.connected && oauth2Client) {
      try {
        const oauth2api = google.oauth2({ version: 'v2', auth: oauth2Client });
        const info = await oauth2api.userinfo.get();
        authStatus.email = info.data.email;
      } catch (_) {
        authStatus = { connected: false, email: null };
      }
    }
    return authStatus;
  },

  isReady: function () {
    return authStatus.connected && calendarClient !== null;
  },

  // ─── Disconnect ────────────────────────────────────────────────
  disconnect: function () {
    clearTokens();
    oauth2Client = createOAuthClient();
    if (!oauth2Client) {
      oauth2Client = new google.auth.OAuth2('placeholder', 'placeholder', 'http://localhost');
    }
    calendarClient = null;
    authStatus = { connected: false, email: null };
    console.log('[GoogleAPI] Disconnected');
  },

  // ─── Calendar Events CRUD ──────────────────────────────────────
  _getCalendarClient: function () {
    if (!calendarClient) throw new Error('Not authenticated');
    return calendarClient;
  },

  listEvents: async function (syncToken, timeMin) {
    const cal = this._getCalendarClient();
    const params = {
      calendarId: 'primary',
      singleEvents: true,
      orderBy: 'updated',
      maxResults: 250,
    };

    if (syncToken) {
      params.syncToken = syncToken;
    } else {
      // Initial full sync: past 6 months to future 2 years
      params.timeMin = timeMin || new Date(Date.now() - 180 * 86400000).toISOString();
      params.timeMax = new Date(Date.now() + 730 * 86400000).toISOString();
    }

    const res = await cal.events.list(params);

    // Map and group events by date
    const grouped = {};
    (res.data.items || []).forEach(gEvent => {
      const mapped = mapGoogleToLocal(gEvent);
      if (!mapped || !mapped.date) return;
      const d = mapped.date;
      delete mapped.date; // remove temporary date field
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(mapped);
    });

    return {
      items: grouped,
      nextSyncToken: res.data.nextSyncToken || null,
    };
  },

  createEvent: async function (dateStr, ev) {
    const cal = this._getCalendarClient();
    const resource = mapLocalToGoogle(dateStr, ev);
    const res = await cal.events.insert({
      calendarId: 'primary',
      resource: resource,
    });
    const gEv = res.data;
    return {
      googleEventId: gEv.id,
      googleSyncSeq: gEv.etag || '',
      updatedAt: gEv.updated || new Date().toISOString(),
    };
  },

  updateEvent: async function (googleEventId, dateStr, ev) {
    const cal = this._getCalendarClient();
    const resource = mapLocalToGoogle(dateStr, ev);
    const res = await cal.events.update({
      calendarId: 'primary',
      eventId: googleEventId,
      resource: resource,
    });
    const gEv = res.data;
    return {
      googleEventId: gEv.id,
      googleSyncSeq: gEv.etag || '',
      updatedAt: gEv.updated || new Date().toISOString(),
    };
  },

  deleteEvent: async function (googleEventId) {
    const cal = this._getCalendarClient();
    try {
      await cal.events.delete({
        calendarId: 'primary',
        eventId: googleEventId,
      });
    } catch (e) {
      // 410 Gone = already deleted, not an error
      if (e.code !== 410) throw e;
    }
  },
};

// ─── Event Mapping: Local → Google ───────────────────────────────
function mapLocalToGoogle(dateStr, ev) {
  // Try to detect the system timezone
  let tz = 'Asia/Shanghai';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
  } catch (_) {}

  const resource = {
    summary: ev.title || '(无标题)',
    description: ev.note || '',
    colorId: appHexToGoogleColorId(ev.color) ? String(appHexToGoogleColorId(ev.color)) : undefined,
    extendedProperties: {
      private: {
        deskcalendarId: String(ev.id),
        completed: ev.completed ? '1' : '0',
        seriesId: ev.seriesId || '',
      },
    },
  };

  if (ev.time) {
    // Timed event
    resource.start = {
      dateTime: `${dateStr}T${ev.time}:00`,
      timeZone: tz,
    };
    resource.end = {
      dateTime: ev.endTime
        ? `${dateStr}T${ev.endTime}:00`
        : `${dateStr}T23:59:00`,
      timeZone: tz,
    };
  } else {
    // All-day event
    resource.start = { date: dateStr };
    const endDate = new Date(dateStr);
    endDate.setDate(endDate.getDate() + 1);
    resource.end = {
      date: endDate.toISOString().slice(0, 10),
    };
  }

  return resource;
}

// ─── Event Mapping: Google → Local ───────────────────────────────
function mapGoogleToLocal(gEvent) {
  let dateStr = '';
  let time = null;
  let endTime = null;

  if (gEvent.start.date) {
    // All-day event
    dateStr = gEvent.start.date;
  } else if (gEvent.start.dateTime) {
    // Timed event
    const startDt = new Date(gEvent.start.dateTime);
    const y = startDt.getFullYear();
    const m = String(startDt.getMonth() + 1).padStart(2, '0');
    const d = String(startDt.getDate()).padStart(2, '0');
    dateStr = `${y}-${m}-${d}`;
    time = `${String(startDt.getHours()).padStart(2, '0')}:${String(startDt.getMinutes()).padStart(2, '0')}`;

    if (gEvent.end.dateTime) {
      const endDt = new Date(gEvent.end.dateTime);
      // Only set endTime if it's not midnight (all-day end marker)
      if (endDt.getHours() !== 0 || endDt.getMinutes() !== 0) {
        endTime = `${String(endDt.getHours()).padStart(2, '0')}:${String(endDt.getMinutes()).padStart(2, '0')}`;
      }
    }
  } else {
    return null; // skip events without date
  }

  // Extract custom fields
  const priv = (gEvent.extendedProperties && gEvent.extendedProperties.private) || {};
  const localId = priv.deskcalendarId || gEvent.id;

  let note = gEvent.description || '';
  // If description is just a JSON dump of our data, don't show it
  if (note.startsWith('{') && note.includes('deskcalendarId')) {
    try { JSON.parse(note); note = ''; } catch (_) {}
  }

  return {
    id: localId,
    date: dateStr,               // temporary, removed by listEvents
    googleEventId: gEvent.id,
    googleSyncSeq: gEvent.etag || '',
    title: gEvent.summary || '',
    time: time,
    endTime: endTime,
    color: googleColorIdToHex(gEvent.colorId),
    note: note,
    completed: gEvent.status === 'cancelled',
    seriesId: priv.seriesId || null,
    updatedAt: gEvent.updated || new Date().toISOString(),
  };
}

module.exports = GoogleAPI;
