// ─── Calendar Module ───────────────────────────────────────────
window.Calendar = {};

// ─── Color helper ───────────────────────────────────────────────
Calendar.hexToRgba = function (hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ─── Calendar language helpers ───────────────────────────────────
Calendar.WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日'];
Calendar.WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

Calendar.getWeekdays = function (lang) {
  return lang === 'ja' ? Calendar.WEEKDAYS_JA : Calendar.WEEKDAYS_ZH;
};

Calendar.getGridOffset = function (firstDay, lang) {
  if (lang === 'ja') {
    // Week starts on Sunday: Sun=0, Mon=1, ..., Sat=6
    return firstDay.getDay();
  }
  // Week starts on Monday: Mon=0, Tue=1, ..., Sun=6
  const off = firstDay.getDay() - 1;
  return off < 0 ? 6 : off;
};

// ─── Determine month grid ──────────────────────────────────────
Calendar.getMonthGrid = function (year, month, lang) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  let startOffset = Calendar.getGridOffset(firstDay, lang || 'zh');

  const grid = [];

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  for (let i = startOffset - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    grid.push({ day, dateStr: App.formatDate(prevYear, prevMonth, day), isOtherMonth: true });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    grid.push({ day: d, dateStr: App.formatDate(year, month, d), isOtherMonth: false });
  }

  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const remainder = grid.length % 7;
  if (remainder > 0) {
    const fill = 7 - remainder;
    for (let d = 1; d <= fill; d++) {
      grid.push({ day: d, dateStr: App.formatDate(nextYear, nextMonth, d), isOtherMonth: true });
    }
  }

  return grid;
};

// ─── Render ────────────────────────────────────────────────────
Calendar.render = function () {
  const { currentYear: y, currentMonth: m, selectedDate } = App.state;
  const s = App.state.data.settings;
  const displayMode = s.displayMode || 'compact';
  const lang = s.calendarLang || 'zh';
  const isOverview = displayMode === 'overview';

  document.getElementById('monthTitle').textContent = App.formatMonthTitle(y, m);

  // Update weekday header
  const wdNames = Calendar.getWeekdays(lang);
  const header = document.getElementById('weekdayHeader');
  header.innerHTML = wdNames.map((d, i) => {
    const isWeekend = lang === 'ja' ? (i === 0 || i === 6) : (i >= 5);
    return `<span${isWeekend ? ' class="weekend"' : ''}>${d}</span>`;
  }).join('');

  const grid = Calendar.getMonthGrid(y, m, lang);
  const container = document.getElementById('calendarGrid');
  container.innerHTML = '';
  container.classList.toggle('overview', isOverview);

  const today = App.getToday();
  const events = App.state.data.events || {};

  grid.forEach(cell => {
    const dateStr = cell.dateStr;
    const el = document.createElement('div');
    el.className = 'day-cell';
    if (cell.isOtherMonth) el.classList.add('other-month');
    if (dateStr === today.str) el.classList.add('today');
    if (dateStr === selectedDate) el.classList.add('selected');

    // Day number
    const num = document.createElement('span');
    num.className = 'day-number';
    num.textContent = cell.day;
    el.appendChild(num);

    const dayEvents = events[dateStr];

    if (isOverview) {
      // ── Overview mode: show event titles inline ──
      const cellEvents = document.createElement('div');
      cellEvents.className = 'cell-events';

      if (dayEvents && dayEvents.length > 0) {
        const maxShow = 3;
        const shown = dayEvents.slice(0, maxShow);
        const remaining = dayEvents.length - maxShow;

        shown.forEach(ev => {
          const evEl = document.createElement('span');
          evEl.className = 'cell-event';
          evEl.textContent = ev.title;
          evEl.title = ev.title + (ev.time ? ' ' + ev.time : '');
          const color = ev.color || '#FF6B6B';
          evEl.style.background = Calendar.hexToRgba(color, 0.22);
          evEl.style.borderLeft = `3px solid ${color}`;
          cellEvents.appendChild(evEl);
        });

        if (remaining > 0) {
          const more = document.createElement('span');
          more.className = 'cell-event overflow';
          more.textContent = `+${remaining}`;
          cellEvents.appendChild(more);
        }
      }

      el.appendChild(cellEvents);
    } else {
      // ── Compact mode: event dots ──
      if (dayEvents && dayEvents.length > 0) {
        const dots = document.createElement('div');
        dots.className = 'event-dots';
        const maxDots = 3;
        const shown = dayEvents.slice(0, maxDots);
        shown.forEach(ev => {
          const dot = document.createElement('span');
          dot.className = 'event-dot';
          dot.style.background = ev.color || '#64b5f6';
          dots.appendChild(dot);
        });
        const remaining = dayEvents.length - maxDots;
        if (remaining > 0) {
          const more = document.createElement('span');
          more.className = 'event-dot-more';
          more.textContent = `+${remaining}`;
          dots.appendChild(more);
        }
        el.appendChild(dots);
      }
    }

    el.dataset.date = dateStr;
    el.addEventListener('click', () => Calendar.selectDate(dateStr));
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data && data.id && data.date && data.date !== dateStr) {
          // Find original event
          const srcEvents = (App.state.data.events || {})[data.date] || [];
          const srcEv = srcEvents.find(ev => ev.id === data.id);
          if (srcEv) {
            // Copy to target date
            const targetKey = dateStr;
            if (!App.state.data.events[targetKey]) {
              App.state.data.events[targetKey] = [];
            }
            const newEv = { ...srcEv, id: App.generateId() };
            App.state.data.events[targetKey].push(newEv);
            App.state.data.events[targetKey].sort((a, b) => {
              if (a.time && b.time) return a.time.localeCompare(b.time);
              if (a.time) return -1;
              if (b.time) return 1;
              return 0;
            });
            App.saveData();
            Calendar.render();
            window.Events.render(App.state.selectedDate);
          }
        }
      } catch (_) {}
    });
    container.appendChild(el);
  });
};

// ─── Date Selection ────────────────────────────────────────────
Calendar.selectDate = function (dateStr) {
  App.state.selectedDate = dateStr;
  Calendar.render();
  window.Events.render(dateStr);
  App.resizeToFit();
};

// ─── Navigation ────────────────────────────────────────────────
Calendar.goToPrevMonth = function () {
  App.state.currentMonth--;
  if (App.state.currentMonth < 0) {
    App.state.currentMonth = 11;
    App.state.currentYear--;
  }
  Calendar.render();
  window.Events.render(App.state.selectedDate);
};

Calendar.goToNextMonth = function () {
  App.state.currentMonth++;
  if (App.state.currentMonth > 11) {
    App.state.currentMonth = 0;
    App.state.currentYear++;
  }
  Calendar.render();
  window.Events.render(App.state.selectedDate);
};

// ─── Date Picker ────────────────────────────────────────────────
Calendar.toggleDatePicker = function () {
  const picker = document.getElementById('datePicker');
  if (!picker.classList.contains('hidden')) {
    picker.classList.add('hidden');
    return;
  }
  Calendar.renderDatePicker();
  picker.classList.remove('hidden');
};

Calendar.renderDatePicker = function () {
  const year = App.state.currentYear;
  document.getElementById('dpYear').textContent = year;
  const grid = document.getElementById('dpMonthGrid');
  grid.innerHTML = '';
  const currentMonth = App.state.currentMonth;
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月',
                       '7月', '8月', '9月', '10月', '11月', '12月'];
  monthNames.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className = 'dp-month-btn';
    if (i === currentMonth) btn.classList.add('current');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      App.state.currentMonth = i;
      Calendar.render();
      window.Events.render(App.state.selectedDate);
      document.getElementById('datePicker').classList.add('hidden');
    });
    grid.appendChild(btn);
  });
};

Calendar.hideDatePicker = function () {
  document.getElementById('datePicker').classList.add('hidden');
};

// ─── Bind Navigation ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('prevMonth').addEventListener('click', Calendar.goToPrevMonth);
  document.getElementById('nextMonth').addEventListener('click', Calendar.goToNextMonth);
  document.getElementById('monthTitle').addEventListener('click', (e) => {
    e.stopPropagation();
    Calendar.toggleDatePicker();
  });
  document.getElementById('dpPrevYear').addEventListener('click', () => {
    App.state.currentYear--;
    Calendar.renderDatePicker();
  });
  document.getElementById('dpNextYear').addEventListener('click', () => {
    App.state.currentYear++;
    Calendar.renderDatePicker();
  });
  // Close picker when clicking outside
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('datePicker');
    if (!picker.classList.contains('hidden')) {
      const title = document.getElementById('monthTitle');
      if (!title.contains(e.target) && !picker.contains(e.target)) {
        picker.classList.add('hidden');
      }
    }
  });
});
