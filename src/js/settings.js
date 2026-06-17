// ─── Settings Module ───────────────────────────────────────────
window.Settings = {};

// ─── Initialize UI from saved settings ─────────────────────────
Settings.initUI = function () {
  const s = App.state.data.settings;

  // Opacity slider
  const slider = document.getElementById('opacitySlider');
  const valDisplay = document.getElementById('opacityValue');
  const opacityVal = Math.round((s.opacity ?? 0.78) * 100);
  slider.value = opacityVal;
  valDisplay.textContent = opacityVal + '%';
  App.applyOpacityToWindow(s.opacity ?? 0.78);

  // Theme toggle button
  const themeLabel = document.getElementById('themeLabel');
  themeLabel.textContent = s.theme === 'light' ? '浅色模式' : '深色模式';

  // Font size slider
  const sizeMap = { 'small': 0, 'default': 1, 'large': 2 };
  const sizeVal = sizeMap[s.fontSize] ?? 1;
  const fsSlider = document.getElementById('fontSizeSlider');
  if (fsSlider) fsSlider.value = sizeVal;
  App.applyFontSize(s.fontSize || 'default');

  // Week start
  const wsLabel = document.getElementById('weekStartLabel');
  wsLabel.textContent = s.weekStart === 'sunday' ? '周日' : '周一';

  // Language
  const langMap = { zh: '中文', ja: '日本語', en: 'English' };
  const langLabel = document.getElementById('langLabel');
  langLabel.textContent = langMap[s.language] || '中文';

  // Grid lines
  const gridToggle = document.getElementById('gridToggle');
  const gridOn = s.showGrid === true;
  gridToggle.checked = gridOn;
  document.getElementById('calendarGrid').classList.toggle('show-grid', gridOn);

  // App version
  window.api.getAppVersion().then(v => {
    document.getElementById('aboutVersion').textContent = 'Desk Calendar v' + v;
  });

  // DevTools toggle
  document.getElementById('devtoolsBtn').addEventListener('click', () => {
    window.api.toggleDevTools();
  });

  // Autostart
  const autostartCheck = document.getElementById('autostartToggle');
  window.api.getAutostart().then(enabled => {
    autostartCheck.checked = enabled;
  });

  // ─── Bind events ────────────────────────────────────────────
  // Opacity
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value);
    valDisplay.textContent = val + '%';
    const opacity = val / 100;
    App.state.data.settings.opacity = opacity;
    App.applyOpacityToWindow(opacity);
    App.saveData();
  });

  // Theme
  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = App.state.data.settings.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    App.state.data.settings.theme = next;
    App.applyTheme(next);
    App.applyOpacityToWindow(App.state.data.settings.opacity ?? 0.78);
    document.getElementById('themeLabel').textContent = next === 'light' ? '浅色模式' : '深色模式';
    App.saveData();
  });

  // Font size slider
  const reverseMap = ['small', 'default', 'large'];
  fsSlider.addEventListener('input', () => {
    const size = reverseMap[parseInt(fsSlider.value)] || 'default';
    App.state.data.settings.fontSize = size;
    App.applyFontSize(size);
    App.saveData();
  });

  // Week start toggle
  document.getElementById('weekStartToggle').addEventListener('click', () => {
    const cur = App.state.data.settings.weekStart || 'monday';
    const next = cur === 'monday' ? 'sunday' : 'monday';
    App.state.data.settings.weekStart = next;
    wsLabel.textContent = next === 'sunday' ? '周日' : '周一';
    App.saveData();
    window.Calendar.render();
    window.Events.render(App.state.selectedDate);
  });

  // Language toggle (3-way cycle)
  const langCycle = ['zh', 'ja', 'en'];
  document.getElementById('langToggle').addEventListener('click', () => {
    const cur = App.state.data.settings.language || 'zh';
    const idx = langCycle.indexOf(cur);
    const next = langCycle[(idx + 1) % langCycle.length];
    App.state.data.settings.language = next;
    langLabel.textContent = langMap[next] || '中文';
    App.saveData();
    window.Calendar.render();
    window.Events.render(App.state.selectedDate);
  });

  // Grid lines
  gridToggle.addEventListener('change', () => {
    const on = gridToggle.checked;
    App.state.data.settings.showGrid = on;
    document.getElementById('calendarGrid').classList.toggle('show-grid', on);
    App.saveData();
  });

  // Autostart
  autostartCheck.addEventListener('change', () => {
    const enabled = autostartCheck.checked;
    App.state.data.settings.autostart = enabled;
    window.api.setAutostart(enabled);
    App.saveData();
  });

  // Google Calendar
  Settings.initGoogleUI();
};

// ─── Google Calendar UI ─────────────────────────────────────────
Settings._googleConnecting = false;

Settings.initGoogleUI = function () {
  var authBtn = document.getElementById('googleAuthBtn');
  var authLabel = document.getElementById('googleAuthLabel');
  var syncItem = document.getElementById('googleSyncItem');
  var syncStatus = document.getElementById('googleSyncStatus');
  var syncDetail = document.getElementById('googleSyncDetail');
  var disconnectBtn = document.getElementById('googleDisconnectBtn');
  var pullBtn = document.getElementById('googlePullBtn');

  if (!authBtn || !authLabel || !syncItem || !syncStatus || !disconnectBtn) return;

  // Check current status
  Settings.refreshGoogleUI();

  // Connect button
  authBtn.addEventListener('click', async function () {
    if (Settings._googleConnecting) return;
    Settings._googleConnecting = true;
    authLabel.textContent = '正在连接...';
    authBtn.disabled = true;

    try {
      var result = await window.GoogleSync.connect();
      if (result && result.connected) {
        Settings.refreshGoogleUI();
      } else {
        authLabel.textContent = '连接账号';
      }
    } catch (e) {
      authLabel.textContent = '连接失败，重试';
    }

    authBtn.disabled = false;
    Settings._googleConnecting = false;
  });

  // Disconnect button
  disconnectBtn.addEventListener('click', async function () {
    await window.GoogleSync.disconnect();
    Settings.refreshGoogleUI();
  });

  // Force sync button
  if (pullBtn) {
    pullBtn.addEventListener('click', async function () {
      pullBtn.disabled = true;
      pullBtn.textContent = '同步中...';
      await window.GoogleSync.forceSync();
      pullBtn.textContent = '立即同步';
      pullBtn.disabled = false;
      Settings.refreshGoogleUI();
    });
  }
};

Settings.refreshGoogleUI = async function () {
  var authBtn = document.getElementById('googleAuthBtn');
  var authLabel = document.getElementById('googleAuthLabel');
  var syncItem = document.getElementById('googleSyncItem');
  var syncStatus = document.getElementById('googleSyncStatus');
  var syncDetail = document.getElementById('googleSyncDetail');
  var pullBtn = document.getElementById('googlePullBtn');

  if (!authBtn || !authLabel || !syncItem || !syncStatus) return;

  try {
    var apiStatus = await window.api.googleGetStatus();
    if (apiStatus && apiStatus.connected) {
      authLabel.textContent = '已连接: ' + (apiStatus.email || 'Google');
      authBtn.style.display = 'none';
      syncItem.style.display = '';

      // Show GoogleSync runtime status
      var gs = window.GoogleSync;
      var label = '已连接';
      if (gs.status === 'syncing') label = '⏳ 同步中...';
      else if (gs.status === 'error') label = '⚠ 错误';
      else if (gs.lastSyncResult) label = '✓ ' + gs.lastSyncResult;
      syncStatus.textContent = label;

      // Detail line: last sync time + error hint
      if (syncDetail) {
        var parts = [];
        if (gs.lastSyncTime) {
          var t = new Date(gs.lastSyncTime);
          parts.push('上次同步: ' + t.toLocaleTimeString());
        }
        if (gs.lastError) {
          parts.push('错误: ' + gs.lastError);
        }
        syncDetail.textContent = parts.join(' | ');
        syncDetail.style.color = gs.lastError ? '#FF3B30' : '';
      }
      if (pullBtn) pullBtn.style.display = '';
    } else {
      authBtn.style.display = '';
      syncItem.style.display = 'none';
      authLabel.textContent = '连接账号';
    }
  } catch (_) {
    authBtn.style.display = '';
    syncItem.style.display = 'none';
    authLabel.textContent = '连接账号';
  }
};

// ─── Toggle settings panel ─────────────────────────────────────
Settings.toggle = function () {
  const panel = document.getElementById('settingsPanel');
  const overlay = document.getElementById('settingsOverlay');
  const isOpen = !panel.classList.contains('hidden');
  panel.classList.toggle('hidden', isOpen);
  overlay.classList.toggle('hidden', isOpen);
};

// ─── Apply opacity to window via CSS ───────────────────────────
App.applyOpacityToWindow = function (value) {
  const container = document.querySelector('.app-container');
  if (!container) return;

  const isLight = document.documentElement.classList.contains('light');

  if (isLight) {
    container.style.background = `rgba(255, 255, 255, ${value * 0.65})`;
  } else {
    container.style.background = `rgba(18, 18, 30, ${value * 0.38})`;
  }

  container.style.backdropFilter = `blur(${16 + (1 - value) * 20}px) saturate(1.4)`;
  container.style.boxShadow = `0 ${4 + (1 - value) * 6}px ${12 + (1 - value) * 24}px rgba(0,0,0,${0.12 + (1 - value) * 0.28})`;
};
