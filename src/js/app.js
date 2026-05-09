// ─── Global Application State & Init ───────────────────────────
const App = {
  state: {
    data: { events: {}, settings: {} },
    currentYear: 0,
    currentMonth: 0, // 0-indexed (0=Jan)
    selectedDate: null, // 'YYYY-MM-DD' or null
    editingEventId: null,
    countdownEvent: null, // { dateStr, id, title, time } or null
  },
  _countdownTimer: null,
};

// ─── Utility ───────────────────────────────────────────────────
App.formatDate = function (year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
};

App.parseDate = function (str) {
  const [y, m, d] = str.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
};

App.formatMonthTitle = function (year, month) {
  return `${year}年${month + 1}月`;
};

App.getToday = function () {
  const t = new Date();
  return {
    year: t.getFullYear(),
    month: t.getMonth(),
    day: t.getDate(),
    str: App.formatDate(t.getFullYear(), t.getMonth(), t.getDate()),
  };
};

App.generateId = function () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
};

// ─── Data Persistence ──────────────────────────────────────────
App.loadData = async function () {
  try {
    App.state.data = await window.api.loadData();
  } catch (e) {
    console.error('Load data failed:', e);
    App.state.data = { events: {}, settings: {} };
  }
};

App.saveData = async function () {
  try {
    await window.api.saveData(App.state.data);
  } catch (e) {
    console.error('Save data failed:', e);
  }
};

// ─── Initialization ────────────────────────────────────────────
App.init = async function () {
  await App.loadData();
  const today = App.getToday();

  if (!App.state.data.settings.theme) {
    App.state.data.settings.theme = 'dark';
  }

  App.state.currentYear = today.year;
  App.state.currentMonth = today.month;
  App.state.selectedDate = today.str;

  App.applyTheme(App.state.data.settings.theme || 'dark');
  App.applyOpacity(App.state.data.settings.opacity ?? 0.78);

  const { Calendar, Events, Settings } = window;
  Calendar.render();
  Events.render(App.state.selectedDate);
  Settings.initUI();
  App.resizeToFit();

  // Restore saved countdown if event still exists
  const savedCd = App.state.data.settings._savedCountdown;
  if (savedCd && savedCd.dateStr && savedCd.id) {
    const evts = (App.state.data.events || {})[savedCd.dateStr] || [];
    if (evts.some(e => e.id === savedCd.id)) {
      App.setCountdown(savedCd.dateStr, savedCd.id, savedCd.title, savedCd.time);
    } else {
      delete App.state.data.settings._savedCountdown;
    }
  }

  document.getElementById('minimizeBtn').addEventListener('click', () => window.api.minimize());
  document.getElementById('closeBtn').addEventListener('click', () => window.api.close());
  document.getElementById('settingsBtn').addEventListener('click', Settings.toggle);
  document.getElementById('closeSettingsBtn').addEventListener('click', Settings.toggle);
  document.getElementById('settingsOverlay').addEventListener('click', Settings.toggle);

  // Mode toggle button in title bar
  App.updateModeToggleBtn();
  document.getElementById('modeToggleBtn').addEventListener('click', async () => {
    const s = App.state.data.settings;
    const goingCompact = s.displayMode === 'overview';

    if (goingCompact) {
      // Save overview width, then resize to compact
      try {
        const cur = await window.api.getWindowSize();
        s._overviewWidth = cur.width;
        await window.api.resizeWindow(380, cur.height);
      } catch (_) {}
    } else {
      // Restore overview width
      try {
        const cur = await window.api.getWindowSize();
        const restoreW = s._overviewWidth || 420;
        s._overviewWidth = undefined;
        await window.api.resizeWindow(restoreW, cur.height);
      } catch (_) {}
    }

    s.displayMode = goingCompact ? 'compact' : 'overview';
    App.saveData();
    App.updateModeToggleBtn();
    window.Calendar.render();
    window.Events.render(App.state.selectedDate);
    App.resizeToFit();
    App.refreshCountdownVisibility();
  });

  // Clear date selection when window loses focus
  window.addEventListener('blur', () => {
    if (App.state.selectedDate) {
      App.state.selectedDate = null;
      window.Calendar.render();
      // Always show today's events in panel when nothing selected
      const today = App.getToday();
      const hasToday = (App.state.data.events || {})[today.str]?.length > 0;
      if (hasToday) {
        App.state.selectedDate = today.str;
        window.Calendar.render();
        window.Events.render(today.str);
      } else {
        window.Events.render(null);
      }
      App.resizeToFit();
    }
  });
};

// ─── Window auto-resize ────────────────────────────────────────
App.resizeToFit = async function () {
  try {
    // Get actual current window width (never change it)
    let w = 380;
    try { w = (await window.api.getWindowSize()).width; } catch (_) { w = App.state.data.settings.width || 380; }
    const container = document.querySelector('.app-container');
    const grid = document.getElementById('calendarGrid');
    const panel = document.getElementById('eventPanel');

    const cStyle = getComputedStyle(container);
    const padTop = parseFloat(cStyle.paddingTop);
    const padBottom = parseFloat(cStyle.paddingBottom);
    const borderY = parseFloat(cStyle.borderTopWidth) + parseFloat(cStyle.borderBottomWidth);

    // Title + weekday fixed height
    const titleH = document.querySelector('.title-bar').offsetHeight +
      parseFloat(getComputedStyle(document.querySelector('.title-bar')).marginBottom || 0);
    const wdH = document.querySelector('.weekday-header').offsetHeight +
      parseFloat(getComputedStyle(document.querySelector('.weekday-header')).marginBottom || 0);

    // Grid content height
    const gridH = grid.scrollHeight;

    // Calculate bottom based on selection state
    let contentEnd;
    if (!App.state.selectedDate) {
      // No selection: end right after grid + small gap
      contentEnd = padTop + borderY / 2 + titleH + wdH + gridH + 6;
    } else {
      // Has selection: include full event panel
      const formHidden = document.getElementById('eventForm').classList.contains('hidden');
      const panelH = Math.min(panel.scrollHeight, 220);
      const panelMt = parseFloat(getComputedStyle(panel).marginTop || 0);
      const gapH = panel.classList.contains('no-selection') ? 0 : panelMt + (panel.classList.contains('no-events') ? 0 : 0);
      const extraBottom = formHidden ? -14 : 0;
      contentEnd = padTop + borderY / 2 + titleH + wdH + gridH + gapH + panelH + extraBottom;
    }

    const totalH = Math.ceil(contentEnd + padBottom + borderY / 2 + 17);
    await window.api.resizeWindow(w, totalH);
  } catch (_) {}
};

// ─── Countdown ─────────────────────────────────────────────────
App.setCountdown = function (dateStr, eventId, title, time) {
  App.state.countdownEvent = { dateStr, id: eventId, title, time };
  App.state.data.settings._savedCountdown = { dateStr, id: eventId, title, time };
  App.saveData();
  App._startCountdownTimer();
  if (App.state.data.settings.displayMode === 'overview') {
    App.updateCountdownDisplay();
  }
};

App.clearCountdown = function () {
  App.state.countdownEvent = null;
  delete App.state.data.settings._savedCountdown;
  App.saveData();
  if (App._countdownTimer) {
    clearInterval(App._countdownTimer);
    App._countdownTimer = null;
  }
  const bar = document.getElementById('countdownBar');
  const text = document.getElementById('countdownText');
  if (bar) bar.classList.add('hidden');
};

App._startCountdownTimer = function () {
  if (App._countdownTimer) clearInterval(App._countdownTimer);
  App._countdownTimer = setInterval(App.updateCountdownDisplay, 30000); // every 30s
};

App.updateCountdownDisplay = function () {
  const ev = App.state.countdownEvent;
  const bar = document.getElementById('countdownBar');
  const text = document.getElementById('countdownText');
  if (!ev || !bar || !text) return;

  const target = new Date(ev.dateStr + (ev.time ? 'T' + ev.time + ':00' : 'T00:00:00'));
  const now = new Date();
  const diff = target - now;

  if (diff <= 0) {
    text.textContent = `「${ev.title}」已到期`;
    bar.classList.remove('hidden');
    return;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  let display;
  if (days > 0) {
    display = `距离「${ev.title}」还有 ${days} 天 ${hours} 小时 ${minutes} 分`;
  } else if (hours > 0) {
    display = `距离「${ev.title}」还有 ${hours} 小时 ${minutes} 分`;
  } else {
    display = `距离「${ev.title}」还有 ${minutes} 分`;
  }
  text.textContent = display;
  bar.classList.remove('hidden');
};

App.refreshCountdownVisibility = function () {
  const isOverview = App.state.data.settings.displayMode === 'overview';
  const bar = document.getElementById('countdownBar');
  if (!bar) return;
  if (isOverview && App.state.countdownEvent) {
    App.updateCountdownDisplay();
  } else {
    bar.classList.add('hidden');
  }
};

App.updateModeToggleBtn = function () {
  const mode = App.state.data.settings.displayMode || 'compact';
  const btn = document.getElementById('modeToggleBtn');
  if (btn) btn.textContent = mode === 'overview' ? '总览' : '紧凑';
};

// ─── Font Size ──────────────────────────────────────────────────
App.applyFontSize = function (size) {
  document.documentElement.classList.remove('font-small', 'font-large');
  if (size && size !== 'default') {
    document.documentElement.classList.add('font-' + size);
  }
};

// ─── Theme ─────────────────────────────────────────────────────
App.applyTheme = function (theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  document.documentElement.classList.toggle('dark', theme !== 'light');
};

// ─── Opacity ───────────────────────────────────────────────────
App.applyOpacity = function (value) {
  const header = document.querySelector('.app-container');
  if (header) {
    header.style.setProperty('--opacity-val', value);
  }
};

// ─── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
