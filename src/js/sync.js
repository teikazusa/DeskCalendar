// ─── Supabase Sync Engine (REST API, no SDK dependency) ────────
window.Sync = { ready: false };

let _url = '';
let _key = '';
let _reconnectTimer = null;

// ─── Init ───────────────────────────────────────────────────────
Sync.init = async function () {
  try {
    const cfg = await window.api.getSupabaseConfig();
    if (!cfg.url || !cfg.key) return;
    _url = cfg.url;
    _key = cfg.key;
    Sync.ready = true;
    console.log('[Sync] Ready');
    Sync._pull(); // pull latest on startup
    Sync._startRealtime();
  } catch (e) { console.log('[Sync] Init error:', e.message); }
};

// ─── Helpers ────────────────────────────────────────────────────
function snakeKeys(ev, dateStr) {
  return {
    id: ev.id,
    date: dateStr,
    title: ev.title || '',
    time: ev.time || null,
    end_time: ev.endTime || null,
    color: ev.color || null,
    note: ev.note || null,
    completed: ev.completed || false,
    series_id: ev.seriesId || null,
    updated_at: new Date().toISOString(),
  };
}

function camelKeys(row) {
  return {
    id: row.id,
    title: row.title,
    time: row.time || null,
    endTime: row.end_time || null,
    color: row.color || null,
    note: row.note || null,
    completed: row.completed || false,
    seriesId: row.series_id || null,
    updatedAt: row.updated_at || '0',
  };
}

async function supabaseFetch(path, opts = {}) {
  const res = await fetch(`${_url}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: _key,
      Authorization: `Bearer ${_key}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
  return res;
}

// ─── Upload ─────────────────────────────────────────────────────
Sync.upsertEvent = async function (dateStr, ev) {
  if (!Sync.ready) return;
  try {
    const body = snakeKeys(ev, dateStr);
    await supabaseFetch('/events?on_conflict=id', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Prefer: 'resolution=merge-duplicates' },
    });
  } catch (e) { console.log('[Sync] upsert:', e.message); }
};

Sync.markDeleted = async function (evId) {
  if (!Sync.ready) return;
  try {
    await supabaseFetch(`/events?id=eq.${evId}`, {
      method: 'PATCH',
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
  } catch (e) { console.log('[Sync] markDeleted:', e.message); }
};

// ─── Pull ───────────────────────────────────────────────────────
Sync._pull = async function () {
  if (!Sync.ready) return;
  try {
    const res = await supabaseFetch('/events?deleted_at=is.null&select=*');
    const rows = await res.json();
    if (!rows || !rows.length) return;
    const remote = {};
    rows.forEach(r => {
      const ev = camelKeys(r);
      const d = r.date;
      if (!remote[d]) remote[d] = [];
      remote[d].push(ev);
    });
    App.state.data.events = Sync._merge(App.state.data.events || {}, remote);
    App.saveData();
    window.Calendar && window.Calendar.render();
    window.Events && window.Events.render(App.state.selectedDate);
  } catch (e) { console.log('[Sync] pull:', e.message); }
};

Sync._merge = function (local, remote) {
  const merged = {};
  const all = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const d of all) {
    const map = new Map();
    for (const e of (local[d] || [])) map.set(e.id, e);
    for (const e of (remote[d] || [])) {
      const le = map.get(e.id);
      if (!le) { map.set(e.id, e); continue; }
      if ((e.updatedAt || '0') > (le.updatedAt || '0')) map.set(e.id, { ...le, ...e });
    }
    merged[d] = Array.from(map.values());
  }
  return merged;
};

// ─── Realtime (polling fallback every 15s) ───────────────────────
Sync._startRealtime = function () {
  if (_reconnectTimer) clearInterval(_reconnectTimer);
  _reconnectTimer = setInterval(Sync._pull, 15000);
};
