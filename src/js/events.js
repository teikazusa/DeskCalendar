// ─── Events Module ─────────────────────────────────────────────
window.Events = {};

const EVENT_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#007AFF', '#AF52DE', '#8E8E93', '#5AC8FA',
];

// Tracks user's choice when editing a series event: 'single' or 'future'
let _seriesEditScope = null;

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
  const lang = App.state.data.settings.language || 'zh';
  const enMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dow = new Date(year, month, day).getDay();
  if (lang === 'en') {
    const enDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    dateLabel.textContent = `${enMonths[month]} ${day}, ${year} ${enDays[dow]}`;
  } else if (lang === 'ja') {
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
    item.draggable = true;
    item.dataset.dragEventId = ev.id;
    item.dataset.dragDate = dateStr;
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', JSON.stringify({ id: ev.id, date: dateStr }));
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });

    const isDone = ev.completed === true;

    // Checkbox
    const cb = document.createElement('span');
    cb.className = 'event-cb';
    cb.textContent = isDone ? '✓' : '○';
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      ev.completed = !isDone;
      App.saveData();
      window.Calendar.render();
      Events.render(dateStr);
    });
    item.appendChild(cb);

    // Dim completed items
    if (isDone) item.classList.add('completed');

    const dot = document.createElement('span');
    dot.className = 'event-color-dot';
    dot.style.background = ev.color || EVENT_COLORS[0];
    if (isDone) dot.style.opacity = '0.3';
    item.appendChild(dot);

    const title = document.createElement('span');
    title.className = 'event-item-title';
    title.textContent = ev.title;
    if (isDone) title.style.textDecoration = 'line-through';
    if (isDone) title.style.opacity = '0.45';
    item.appendChild(title);

    if (ev.time) {
      const time = document.createElement('span');
      time.className = 'event-item-time';
      time.textContent = ev.endTime ? `${ev.time} - ${ev.endTime}` : ev.time;
      if (isDone) time.style.textDecoration = 'line-through';
      if (isDone) time.style.opacity = '0.45';
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

    const cdBtn = document.createElement('button');
    cdBtn.className = 'event-action-btn';
    cdBtn.textContent = '⏱';
    const curCd = App.state.countdownEvent;
    if (curCd && curCd.id === ev.id && curCd.dateStr === dateStr) {
      cdBtn.classList.add('cd-active');
    }
    cdBtn.title = curCd && curCd.id === ev.id && curCd.dateStr === dateStr ? '取消倒计时' : '倒计时';
    cdBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = App.state.countdownEvent;
      if (cur && cur.id === ev.id && cur.dateStr === dateStr) {
        App.clearCountdown();
      } else {
        App.setCountdown(dateStr, ev.id, ev.title, ev.time);
      }
      Events.render(App.state.selectedDate);
    });
    actions.appendChild(cdBtn);

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

// ─── Populate edit form (after dialog or directly) ──────────────
Events._populateEditForm = function (ev, titleInput, timeInput, endTimeInput, noteInput) {
  titleInput.value = ev.title || '';
  timeInput.value = ev.time || '';
  if (endTimeInput) endTimeInput.value = ev.endTime || '';
  noteInput.value = ev.note || '';
  document.getElementById('deleteEventBtn').classList.remove('hidden');
  document.querySelectorAll('.color-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === (ev.color || EVENT_COLORS[0]));
  });
  titleInput.focus();
};

// ─── Show inline form ──────────────────────────────────────────
Events.showForm = function (dateStr, eventId) {
  const form = document.getElementById('eventForm');
  const titleInput = document.getElementById('eventTitle');
  const timeInput = document.getElementById('eventTime');
  const endTimeInput = document.getElementById('eventEndTime');
  const noteInput = document.getElementById('eventNote');
  const saveBtn = document.getElementById('saveEventBtn');
  const deleteBtn = document.getElementById('deleteEventBtn');
  const addBtn = document.getElementById('addEventBtn');

  // Populate color picker early
  Events.renderColorPicker();

  if (eventId) {
    // Editing existing event
    App.state.editingEventId = eventId;
    const events = (App.state.data.events[dateStr] || []);
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    // If event has seriesId and no scope chosen yet, show dialog FIRST
    if (ev.seriesId && !_seriesEditScope) {
      document.getElementById('seriesDialogOverlay').classList.remove('hidden');
      document.getElementById('seriesDialog').classList.remove('hidden');
      return; // Form will open after dialog choice
    }
    if (!_seriesEditScope) _seriesEditScope = 'single';

    // Show form for editing
    document.getElementById('eventPanel').classList.remove('no-events');
    form.classList.remove('hidden');
    addBtn.classList.add('hidden');
    Events._populateEditForm(ev, titleInput, timeInput, endTimeInput, noteInput);
  } else {
    // New event
    App.state.editingEventId = null;

    // Show form for new event
    document.getElementById('eventPanel').classList.remove('no-events');
    form.classList.remove('hidden');
    addBtn.classList.add('hidden');

    titleInput.value = '';
    timeInput.value = '';
    if (endTimeInput) endTimeInput.value = '';
    noteInput.value = '';
    deleteBtn.classList.add('hidden');

    document.querySelectorAll('.color-option').forEach((el, i) => {
      el.classList.toggle('selected', i === 0);
    });
  }

  titleInput.focus();
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
  const endTime = document.getElementById('eventEndTime') ? document.getElementById('eventEndTime').value : '';
  const note = document.getElementById('eventNote').value.trim();
  const selectedColor = document.querySelector('.color-option.selected');
  const color = selectedColor ? selectedColor.dataset.color : EVENT_COLORS[0];

  if (!App.state.data.events[dateStr]) {
    App.state.data.events[dateStr] = [];
  }

  if (App.state.editingEventId) {
    // Find the event being edited to get its seriesId
    const curEvents = App.state.data.events[dateStr] || [];
    const curEv = curEvents.find(e => e.id === App.state.editingEventId);
    const seriesId = curEv ? curEv.seriesId : null;

    // Update single event
    const idx = curEvents.findIndex(e => e.id === App.state.editingEventId);
    if (idx !== -1) {
      curEvents[idx] = { id: App.state.editingEventId, title, time, endTime, color, note, completed: curEvents[idx].completed || false, seriesId };
    }

    // If scope is 'future', update all future events in the same series
    if (_seriesEditScope === 'future' && seriesId) {
      const targetDate = App.parseDate(dateStr);
      const targetNum = targetDate.year * 10000 + (targetDate.month + 1) * 100 + targetDate.day;
      Object.keys(App.state.data.events).forEach(ds => {
        if (ds === dateStr) return; // already updated
        const dsParts = ds.split('-').map(Number);
        const dsNum = dsParts[0] * 10000 + dsParts[1] * 100 + dsParts[2];
        if (dsNum >= targetNum) {
          const list = App.state.data.events[ds];
          let changed = false;
          list.forEach(e => {
            if (e.seriesId === seriesId) {
              e.title = title;
              e.time = time;
              e.endTime = endTime;
              e.color = color;
              e.note = note;
              changed = true;
            }
          });
          if (changed) {
            list.sort((a, b) => {
              if (a.time && b.time) return a.time.localeCompare(b.time);
              if (a.time) return -1;
              if (b.time) return 1;
              return 0;
            });
          }
        }
      });
    }
    _seriesEditScope = null;
  } else {
    // New event
    const id = App.generateId();
    App.state.data.events[dateStr].push({ id, title, time, endTime, color, note, completed: false });
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
  _seriesEditScope = null;
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

  // Series edit dialog buttons
  document.getElementById('seriesEditSingle').addEventListener('click', () => {
    _seriesEditScope = 'single';
    document.getElementById('seriesDialogOverlay').classList.add('hidden');
    document.getElementById('seriesDialog').classList.add('hidden');
    // Re-populate form now that scope is set
    Events.showForm(App.state.selectedDate, App.state.editingEventId);
  });
  document.getElementById('seriesEditFuture').addEventListener('click', () => {
    _seriesEditScope = 'future';
    document.getElementById('seriesDialogOverlay').classList.add('hidden');
    document.getElementById('seriesDialog').classList.add('hidden');
    Events.showForm(App.state.selectedDate, App.state.editingEventId);
  });

  // Enter key to save
  document.getElementById('eventTitle').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') Events.saveEvent();
  });

  // Clear time button
  document.getElementById('timeClearBtn').addEventListener('click', () => {
    document.getElementById('eventTime').value = '';
    document.getElementById('eventEndTime').value = '';
    document.getElementById('eventTime').focus();
  });
});
