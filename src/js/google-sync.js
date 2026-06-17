// ─── Google Calendar Sync Engine (renderer process) ────────────
window.GoogleSync = { ready: false };

let _pollTimer = null;
let _syncToken = null;
let _suppressPush = false;
let _pollInterval = 300000; // 5 minutes default

// ─── Init ───────────────────────────────────────────────────────
GoogleSync.init = async function () {
  try {
    const status = await window.api.googleGetStatus();
    if (status && status.connected) {
      GoogleSync.ready = true;
      console.log('[GoogleSync] Connected as', status.email);
      // Pull latest on startup
      await GoogleSync._pull();
      // Upload any unsynced local events
      await GoogleSync._uploadAllLocal();
      // Start polling
      GoogleSync._startPolling();
    } else {
      console.log('[GoogleSync] Not connected');
    }
  } catch (e) {
    console.log('[GoogleSync] Init error:', e.message);
  }
};

// ─── Push: Create or update event in Google Calendar ────────────
GoogleSync.pushEvent = async function (dateStr, ev) {
  if (!GoogleSync.ready || _suppressPush) return;
  try {
    let result;
    if (ev.googleEventId) {
      result = await window.api.googleUpdateEvent(ev.googleEventId, dateStr, ev);
    } else {
      result = await window.api.googleCreateEvent(dateStr, ev);
    }
    if (result && result.googleEventId) {
      ev.googleEventId = result.googleEventId;
      ev.googleSyncSeq = result.googleSyncSeq;
      if (result.updatedAt) ev.updatedAt = result.updatedAt;
      App.saveData();

      // Suppress push briefly to avoid re-push on next poll cycle
      _suppressPush = true;
      setTimeout(function () { _suppressPush = false; }, 3000);
    }
  } catch (e) {
    console.log('[GoogleSync] Push error:', e.message);
  }
};

// ─── Delete event from Google Calendar ──────────────────────────
GoogleSync.deleteEvent = async function (ev) {
  if (!GoogleSync.ready || _suppressPush || !ev.googleEventId) return;
  try {
    await window.api.googleDeleteEvent(ev.googleEventId);
    _suppressPush = true;
    setTimeout(function () { _suppressPush = false; }, 3000);
  } catch (e) {
    console.log('[GoogleSync] Delete error:', e.message);
  }
};

// ─── Upload all unsynced local events ───────────────────────────
GoogleSync._uploadAllLocal = async function () {
  if (!GoogleSync.ready) return;
  var local = App.state.data.events || {};
  var allDates = Object.keys(local);
  var count = 0;
  for (var di = 0; di < allDates.length; di++) {
    var d = allDates[di];
    var list = local[d] || [];
    for (var ei = 0; ei < list.length; ei++) {
      var ev = list[ei];
      if (!ev.googleEventId) {
        try {
          var result = await window.api.googleCreateEvent(d, ev);
          if (result && result.googleEventId) {
            ev.googleEventId = result.googleEventId;
            ev.googleSyncSeq = result.googleSyncSeq;
            if (result.updatedAt) ev.updatedAt = result.updatedAt;
            count++;
          }
        } catch (e) {
          console.log('[GoogleSync] Upload error for', ev.title, ':', e.message);
        }
      }
    }
  }
  if (count > 0) {
    await App.saveData();
    console.log('[GoogleSync] Uploaded', count, 'local events');
  }
};

// ─── Pull: Fetch events from Google Calendar and merge ──────────
GoogleSync._pull = async function () {
  if (!GoogleSync.ready) return;
  try {
    var result = await window.api.googleListEvents(_syncToken || null);
    if (!result || !result.items) return;

    var remote = result.items;
    var hasItems = false;
    var keys = Object.keys(remote);
    for (var i = 0; i < keys.length; i++) {
      if (remote[keys[i]] && remote[keys[i]].length > 0) {
        hasItems = true;
        break;
      }
    }

    if (hasItems) {
      var local = App.state.data.events || {};
      App.state.data.events = _merge(LocalOrEmpty(local), remote);
      App.saveData();

      // Refresh UI
      if (window.Calendar) window.Calendar.render();
      if (window.Events) window.Events.render(App.state.selectedDate);
      if (typeof App.resizeToFit === 'function') App.resizeToFit();
    }

    // Store syncToken for incremental sync next time
    if (result.nextSyncToken) {
      _syncToken = result.nextSyncToken;
    }
  } catch (e) {
    console.log('[GoogleSync] Pull error:', e.message);
    // If syncToken expired (410 Gone), clear it for full re-sync
    if (e.message && e.message.indexOf('410') !== -1) {
      _syncToken = null;
      console.log('[GoogleSync] Sync token expired, will do full sync next');
    }
  }
};

// ─── Merge: Timestamp-based conflict resolution ─────────────────
// Same pattern as Sync._merge in sync.js
function _merge(local, remote) {
  var merged = {};
  var allDates = {};
  var ld, rd;

  for (ld in local) { if (local.hasOwnProperty(ld)) allDates[ld] = true; }
  for (rd in remote) { if (remote.hasOwnProperty(rd)) allDates[rd] = true; }

  var dates = Object.keys(allDates);
  for (var di = 0; di < dates.length; di++) {
    var d = dates[di];
    var map = {};

    // Index local events by googleEventId (preferred) or id
    var localList = local[d] || [];
    for (var li = 0; li < localList.length; li++) {
      var le = localList[li];
      var key = le.googleEventId || le.id;
      map[key] = le;
    }

    // Merge remote events
    var remoteList = remote[d] || [];
    for (var ri = 0; ri < remoteList.length; ri++) {
      var re = remoteList[ri];
      var key = re.googleEventId || re.id;

      if (re.completed) {
        // Google event is cancelled — remove from local
        delete map[key];
        continue;
      }

      var existing = map[key];
      if (!existing) {
        // New event from Google — add to local
        map[key] = re;
        continue;
      }

      // Both exist — timestamp-based last-writer-wins
      var localTime = existing.updatedAt || '0';
      var remoteTime = re.updatedAt || '0';
      if (remoteTime > localTime) {
        // Google is newer — overwrite local fields, keep local id
        var localId = existing.id;
        for (var k in re) {
          if (re.hasOwnProperty(k)) existing[k] = re[k];
        }
        existing.id = localId;
      }
      // else: local is newer — keep local (will be pushed up on next uploadAllLocal)
    }

    // Collect non-completed events
    var mergedList = [];
    for (var mk in map) {
      if (map.hasOwnProperty(mk) && !map[mk].completed) {
        mergedList.push(map[mk]);
      }
    }

    // Sort by time
    if (mergedList.length > 0) {
      mergedList.sort(function (a, b) {
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return 0;
      });
      merged[d] = mergedList;
    }
  }

  return merged;
}

function LocalOrEmpty(obj) {
  return obj || {};
}

// ─── Polling ────────────────────────────────────────────────────
GoogleSync._startPolling = function () {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(GoogleSync._pull, _pollInterval);
};

GoogleSync._stopPolling = function () {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
};

// ─── Auth helpers for settings UI ───────────────────────────────
GoogleSync.connect = async function () {
  try {
    var result = await window.api.googleAuth();
    if (result && result.connected) {
      GoogleSync.ready = true;
      await GoogleSync._pull();
      await GoogleSync._uploadAllLocal();
      GoogleSync._startPolling();
      return result;
    }
  } catch (e) {
    console.log('[GoogleSync] Auth error:', e.message);
    throw e;
  }
  return null;
};

GoogleSync.disconnect = async function () {
  GoogleSync.ready = false;
  GoogleSync._stopPolling();
  _syncToken = null;
  await window.api.googleDisconnect();
};
