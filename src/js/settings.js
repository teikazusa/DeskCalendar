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

  // Calendar language
  const langLabel = document.getElementById('langLabel');
  langLabel.textContent = s.calendarLang === 'ja' ? '日本語' : '中文';

  // Grid lines
  const gridToggle = document.getElementById('gridToggle');
  const gridOn = s.showGrid === true;
  gridToggle.checked = gridOn;
  document.getElementById('calendarGrid').classList.toggle('show-grid', gridOn);

  // App version
  window.api.getAppVersion().then(v => {
    document.getElementById('aboutVersion').textContent = 'Desk Calendar v' + v;
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

  // Calendar language
  document.getElementById('langToggle').addEventListener('click', () => {
    const current = App.state.data.settings.calendarLang || 'zh';
    const next = current === 'zh' ? 'ja' : 'zh';
    App.state.data.settings.calendarLang = next;
    langLabel.textContent = next === 'ja' ? '日本語' : '中文';
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
