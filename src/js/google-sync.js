// ─── Google Calendar Sync Engine (renderer process) ────────────
window.GoogleSync = {
  ready: false,
  status: 'disconnected', // 'disconnected' | 'idle' | 'syncing' | 'error'
  lastSyncTime: null,
  lastSyncResult: '',     // human-readable result
  lastError: '',
};

var _pollTimer = null;
var _syncToken = null;
var _suppressPush = false;
var _pollInterval = 300000; // 5 minutes default
var _notifyTimer = null;

// ─── In-app notification (uses countdown bar) ───────────────────
function _notify(msg, isError) {
  var bar = document.getElementById('countdownBar');
  var text = document.getElementById('countdownText');
  if (!bar || !text) return;
  if (_notifyTimer) clearTimeout(_notifyTimer);
  bar.classList.remove('hidden');
  text.textContent = (isError ? '⚠ ' : '') + msg;
  bar.style.background = isError ? 'rgba(255,59,48,0.18)' : 'rgba(52,199,89,0.15)';
  _notifyTimer = setTimeout(function () {
    bar.classList.add('hidden');
    bar.style.background = '';
    bar.style.background = 'rgba(255,255,255,0.06)'; // restore original
  }, 5000);
}

// ─── Helpers ────────────────────────────────────────────────────
function _setStatus(status, result, errMsg) {
  GoogleSync.status = status;
  if (result !== undefined) {
    GoogleSync.lastSyncResult = result;
    GoogleSync.lastSyncTime = new Date().toISOString();
    if (result) _notify(result, status === 'error');
  }
  if (errMsg !== undefined) {
    GoogleSync.lastError = errMsg;
    if (errMsg) _notify(errMsg, true);
  }
  }
  if (errMsg !== undefined) GoogleSync.lastError = errMsg;
  // Refresh settings UI if open
  if (window.Settings && typeof window.Settings.refreshGoogleUI === 'function') {
    window.Settings.refreshGoogleUI();
  }
}

// ─── Init ───────────────────────────────────────────────────────
GoogleSync.init = async function () {
  try {
    var status = await window.api.googleGetStatus();
    if (status && status.connected) {
      GoogleSync.ready = true;
      _setStatus('idle', '已连接 ' + (status.email || 'Google'));
      // Pull latest on startup
      await GoogleSync._pull();
      // Upload any unsynced local events
      await GoogleSync._uploadAllLocal();
      // Start polling
      GoogleSync._startPolling();
    } else {
      _setStatus('disconnected', '');
    }
  } catch (e) {
    _setStatus('error', '', 'Init: ' + e.message);
  }
};

// ─── Push: Create or update event in Google Calendar ────────────
GoogleSync.pushEvent = async function (dateStr, ev) {
  if (!GoogleSync.ready || _suppressPush) return;
  _setStatus('syncing');
  try {
    var result;
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
      _setStatus('idle', '已推送: ' + ev.title);
      // Suppress push briefly to avoid re-push on next poll cycle
      _suppressPush = true;
      setTimeout(function () { _suppressPush = false; }, 3000);
    } else {
      _setStatus('error', '', '推送返回空结果');
    }
  } catch (e) {
    _setStatus('error', '', '推送失败: ' + e.message);
  }
};

// ─── Delete event from Google Calendar ──────────────────────────
GoogleSync.deleteEvent = async function (ev) {
  if (!GoogleSync.ready || _suppressPush || !ev.googleEventId) return;
  _setStatus('syncing');
  try {
    await window.api.googleDeleteEvent(ev.googleEventId);
    _setStatus('idle', '已删除: ' + ev.title);
    _suppressPush = true;
    setTimeout(function () { _suppressPush = false; }, 3000);
  } catch (e) {
    _setStatus('error', '', '删除失败: ' + e.message);
  }
};

// ─── Upload all unsynced local events ───────────────────────────
GoogleSync._uploadAllLocal = async function () {
  if (!GoogleSync.ready) return;
  _setStatus('syncing');
  var local = App.state.data.events || {};
  var allDates = Object.keys(local);
  var count = 0;
  var errors = [];
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
          errors.push(ev.title + ': ' + e.message);
        }
      }
    }
  }
  if (count > 0) {
    await App.saveData();
    var msg = '已上传 ' + count + ' 条事项';
    if (errors.length > 0) msg += '，' + errors.length + ' 条失败';
    _setStatus('idle', msg, errors.length > 0 ? errors.join('; ') : '');
  } else if (errors.length > 0) {
    _setStatus('error', '', '全部上传失败: ' + errors.join('; '));
  } else {
    _setStatus('idle', allDates.length === 0 ? '暂无本地事项' : '所有事项已同步');
  }
};

// ─── Pull: Fetch events from Google Calendar and merge ──────────
GoogleSync._pull = async function () {
  if (!GoogleSync.ready) return;
  _setStatus('syncing');
  try {
    var result = await window.api.googleListEvents(_syncToken || null);
    if (!result || !result.items) {
      _setStatus('idle', 'Google 日历无事项');
      return;
    }

    var remote = result.items;
    var remoteCount = 0;
    var keys = Object.keys(remote);
    for (var i = 0; i < keys.length; i++) {
      if (remote[keys[i]]) remoteCount += remote[keys[i]].length;
    }

    if (remoteCount > 0) {
      var local = App.state.data.events || {};
      App.state.data.events = _merge(local, remote);
      App.saveData();
      _setStatus('idle', '从 Google 拉取 ' + remoteCount + ' 条事项');
      // Refresh UI
      if (window.Calendar) window.Calendar.render();
      if (window.Events) window.Events.render(App.state.selectedDate);
      if (typeof App.resizeToFit === 'function') App.resizeToFit();
    } else {
      _setStatus('idle', 'Google 日历无事项');
    }

    // Store syncToken for incremental sync next time
    if (result.nextSyncToken) {
      _syncToken = result.nextSyncToken;
    }
  } catch (e) {
    var errMsg = e.message || String(e);
    _setStatus('error', '', '拉取失败: ' + errMsg);
    // If syncToken expired (410 Gone), clear it for full re-sync
    if (errMsg.indexOf('410') !== -1) {
      _syncToken = null;
    }
  }
};

// ─── Force sync now (called from settings UI) ───────────────────
GoogleSync.forceSync = async function () {
  if (!GoogleSync.ready) {
    _setStatus('error', '', '未连接');
    return;
  }
  _setStatus('syncing');
  await GoogleSync._pull();
  await GoogleSync._uploadAllLocal();
};

// ─── Merge: Timestamp-based conflict resolution ─────────────────
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
        delete map[key];
        continue;
      }

      var existing = map[key];
      if (!existing) {
        map[key] = re;
        continue;
      }

      // Both exist — timestamp-based last-writer-wins
      var localTime = existing.updatedAt || '0';
      var remoteTime = re.updatedAt || '0';
      if (remoteTime > localTime) {
        var localId = existing.id;
        for (var k in re) {
          if (re.hasOwnProperty(k)) existing[k] = re[k];
        }
        existing.id = localId;
      }
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
    _setStatus('syncing', '正在授权...');
    var result = await window.api.googleAuth();
    if (result && result.connected) {
      GoogleSync.ready = true;
      _setStatus('syncing', '授权成功，正在同步...');
      await GoogleSync._pull();
      await GoogleSync._uploadAllLocal();
      GoogleSync._startPolling();
      return result;
    }
    _setStatus('disconnected', '');
  } catch (e) {
    _setStatus('error', '', '授权失败: ' + e.message);
    throw e;
  }
  return null;
};

GoogleSync.disconnect = async function () {
  GoogleSync.ready = false;
  GoogleSync._stopPolling();
  _syncToken = null;
  _setStatus('disconnected', '已断开');
  await window.api.googleDisconnect();
};
