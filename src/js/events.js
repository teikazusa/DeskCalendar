// ─── Events Module ─────────────────────────────────────────────
window.Events = {};

const EVENT_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#007AFF', '#AF52DE', '#C67C52', '#5AC8FA',
];

// ─── Render events for a given date ────────────────────────────
Events.render = function (dateStr) {
  const container = document.getElementById('eventList');
  const dateLabel = document.getElementById('eventDate');
  const addBtn = document.getElementById('addEventBtn');

  if (!dateStr) {
    document.getElementById('eventPanel').classList.add('no-selection');
    container.innerHTML = '';
    addBtn.classList.add('hidden');
    return;
  }

  document.getElementById('eventPanel').classList.remove('no-selection');

  // Format date for display
  const { year, month, day } = App.parseDate(dateStr);
  const lang = App.state.data.settings.calendarLang || 'zh';
  const dow = new Date(year, month, day).getDay();
  if (lang === 'ja') {
    const jaDays = ['日', '月', '火', '水', '木', '金', '土'];
    dateLabel.textContent = `${year}年${month + 1}月${day}日 ${jaDays[dow]}曜日`;
  } else {
    const zhDays = ['日', '一', '二', '三', '四', '五', '六'];
    dateLabel.textContent = `${year}年${month + 1}月${day}日 星期${zhDays[dow]}`;
  }
  addBtn.classList.remove('hidden');

  // Get events for this date
  const events = (App.state.data.events || {})[dateStr] || [];
  const panel = document.getElementById('eventPanel');

  if (events.length === 0) {
    container.innerHTML = '';
    panel.classList.add('no-events');
    return;
  }

  panel.classList.remove('no-events');
  container.innerHTML = '';
  events.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'event-item';

    const dot = document.createElement('span');
    dot.className = 'event-color-dot';
    dot.style.background = ev.color || EVENT_COLORS[0];
    item.appendChild(dot);

    const title = document.createElement('span');
    title.className = 'event-item-title';
    title.textContent = ev.title;
    item.appendChild(title);

    if (ev.time) {
      const time = document.createElement('span');
      time.className = 'event-item-time';
      time.textContent = ev.time;
      item.appendChild(time);
    }

    const actions = document.createElement('div');
    actions.className = 'event-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'event-action-btn';
    editBtn.textContent = '✎';
    editBtn.title = '编辑';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Events.showForm(dateStr, ev.id);
    });
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'event-action-btn delete-btn';
    delBtn.textContent = '✕';
    delBtn.title = '删除';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Events.deleteEvent(dateStr, ev.id);
    });
    actions.appendChild(delBtn);

    item.appendChild(actions);

    // Click to edit
    item.addEventListener('click', () => Events.showForm(dateStr, ev.id));

    container.appendChild(item);
  });
};

// ─── Show inline form ──────────────────────────────────────────
Events.showForm = function (dateStr, eventId) {
  const form = document.getElementById('eventForm');
  const titleInput = document.getElementById('eventTitle');
  const timeInput = document.getElementById('eventTime');
  const noteInput = document.getElementById('eventNote');
  const saveBtn = document.getElementById('saveEventBtn');
  const deleteBtn = document.getElementById('deleteEventBtn');
  const addBtn = document.getElementById('addEventBtn');

  // Remove no-events restriction so form is fully visible
  document.getElementById('eventPanel').classList.remove('no-events');
  form.classList.remove('hidden');
  addBtn.classList.add('hidden');

  // Populate color picker
  Events.renderColorPicker();

  if (eventId) {
    // Editing existing event
    App.state.editingEventId = eventId;
    const events = (App.state.data.events[dateStr] || []);
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    titleInput.value = ev.title || '';
    timeInput.value = ev.time || '';
    noteInput.value = ev.note || '';
    deleteBtn.classList.remove('hidden');

    // Select current color
    document.querySelectorAll('.color-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.color === (ev.color || EVENT_COLORS[0]));
    });
  } else {
    // New event
    App.state.editingEventId = null;
    titleInput.value = '';
    timeInput.value = '';
    noteInput.value = '';
    deleteBtn.classList.add('hidden');

    // Select first color
    document.querySelectorAll('.color-option').forEach((el, i) => {
      el.classList.toggle('selected', i === 0);
    });
  }

  titleInput.focus();
  // Expand window to fully show the form
  setTimeout(() => App.resizeToFit(), 50);
};

// ─── Render color picker ───────────────────────────────────────
Events.renderColorPicker = function () {
  const container = document.getElementById('colorPicker');
  container.innerHTML = '';
  EVENT_COLORS.forEach(color => {
    const el = document.createElement('span');
    el.className = 'color-option';
    el.style.background = color;
    el.dataset.color = color;
    el.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
    });
    container.appendChild(el);
  });
};

// ─── Save event (new or edited) ────────────────────────────────
Events.saveEvent = function () {
  const dateStr = App.state.selectedDate;
  if (!dateStr) return;

  const title = document.getElementById('eventTitle').value.trim();
  if (!title) {
    document.getElementById('eventTitle').focus();
    return;
  }

  const time = document.getElementById('eventTime').value;
  const note = document.getElementById('eventNote').value.trim();
  const selectedColor = document.querySelector('.color-option.selected');
  const color = selectedColor ? selectedColor.dataset.color : EVENT_COLORS[0];

  if (!App.state.data.events[dateStr]) {
    App.state.data.events[dateStr] = [];
  }

  if (App.state.editingEventId) {
    // Update existing
    const idx = App.state.data.events[dateStr].findIndex(e => e.id === App.state.editingEventId);
    if (idx !== -1) {
      App.state.data.events[dateStr][idx] = { id: App.state.editingEventId, title, time, color, note };
    }
  } else {
    // New event
    const id = App.generateId();
    App.state.data.events[dateStr].push({ id, title, time, color, note });
  }

  // Sort events by time (events with time first, then by time)
  App.state.data.events[dateStr].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });

  App.saveData();
  Events.cancelForm();
  Calendar.render();
  Events.render(dateStr);
  App.resizeToFit();
};

// ─── Cancel form ───────────────────────────────────────────────
Events.cancelForm = function () {
  const form = document.getElementById('eventForm');
  form.classList.add('hidden');
  document.getElementById('addEventBtn').classList.remove('hidden');
  App.state.editingEventId = null;
  // Re-evaluate no-events state
  if (App.state.selectedDate) {
    const events = (App.state.data.events || {})[App.state.selectedDate] || [];
    const panel = document.getElementById('eventPanel');
    if (events.length === 0) {
      panel.classList.add('no-events');
    } else {
      panel.classList.remove('no-events');
    }
  }
  setTimeout(() => App.resizeToFit(), 50);
};

// ─── Delete event ──────────────────────────────────────────────
Events.deleteEvent = function (dateStr, eventId) {
  if (!dateStr || !eventId) return;
  const events = App.state.data.events[dateStr] || [];
  App.state.data.events[dateStr] = events.filter(e => e.id !== eventId);
  if (App.state.data.events[dateStr].length === 0) {
    delete App.state.data.events[dateStr];
  }
  App.saveData();
  Events.cancelForm();
  Calendar.render();
  Events.render(dateStr);
  App.resizeToFit();
};

// ─── Bind Events ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('addEventBtn').addEventListener('click', () => {
    Events.showForm(App.state.selectedDate, null);
  });
  document.getElementById('saveEventBtn').addEventListener('click', Events.saveEvent);
  document.getElementById('cancelEventBtn').addEventListener('click', Events.cancelForm);
  document.getElementById('deleteEventBtn').addEventListener('click', () => {
    Events.deleteEvent(App.state.selectedDate, App.state.editingEventId);
  });

  // Enter key to save
  document.getElementById('eventTitle').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') Events.saveEvent();
  });
});
