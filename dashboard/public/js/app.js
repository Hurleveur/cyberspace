/**
 * Bookmark tracker — persisted in localStorage.
 */
const BookmarkTracker = {
  KEY: 'cyberspace-bookmarks',

  _getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || '{}');
    } catch {
      return {};
    }
  },

  isBookmarked(id) {
    return !!this._getAll()[id];
  },

  toggle(id) {
    const all = this._getAll();
    if (all[id]) {
      delete all[id];
    } else {
      all[id] = Date.now();
    }
    localStorage.setItem(this.KEY, JSON.stringify(all));
    return !!all[id];
  },
};

/**
 * Read/Unread tracker — persisted in localStorage.
 */
const ReadTracker = {
  KEY: 'cyberspace-read-items',

  _getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || '{}');
    } catch {
      return {};
    }
  },

  isRead(id) {
    return !!this._getAll()[id];
  },

  markRead(id) {
    const all = this._getAll();
    all[id] = Date.now();
    localStorage.setItem(this.KEY, JSON.stringify(all));
  },

  markAllRead(ids) {
    const all = this._getAll();
    for (const id of ids) all[id] = Date.now();
    localStorage.setItem(this.KEY, JSON.stringify(all));
  },

  getUnreadCount(ids) {
    const all = this._getAll();
    return ids.filter(id => !all[id]).length;
  },
};

/**
 * Main application controller — initializes everything, manages panels,
 * handles keyboard shortcuts, and coordinates WebSocket events.
 */
const App = {
  panels: {
    left: { el: null, visible: true },
    right: { el: null, visible: false },
  },

  // Which tab is active in the right panel ('events' or 'todo')
  currentRightTab: 'events',

  shortcuts: [
    { key: 'F', action: 'Open Feeds panel' },
    { key: 'B', action: 'Open Briefing panel' },
    { key: 'E', action: 'Toggle Events panel' },
    { key: 'T', action: 'Toggle Tasks panel' },
    { key: 'S', action: 'Open Settings' },
    { key: 'Ctrl+K', action: 'Command palette' },
    { key: '/', action: 'Search in Briefing' },
    { key: '↑ ↓', action: 'Navigate feed items' },
    { key: 'Enter', action: 'Expand selected item' },
    { key: 'Shift+Enter', action: 'Open item externally' },
    { key: 'Esc', action: 'Close overlays / clear focus' },
    { key: '?', action: 'Show keyboard shortcuts' },
  ],

  async init() {
    this.panels.left.el = document.getElementById('left-panel');
    this.panels.right.el = document.getElementById('right-panel');

    // Initialize all modules
    WS.init();
    MapView.init();
    Settings.init();
    Palette.init();

    // Load data
    await Promise.all([
      Feeds.init(),
      Briefing.init(),
      Events.init(),
    ]);

    // Init todo after briefing (needs Briefing.dates[0])
    await TodoList.init();

    // Share markers with briefing for cross-linking
    if (MapView.markers) {
      Briefing.setMarkers(MapView.markers.map(m => m.data));
    }

    // Bind UI events
    this.bindPanelButtons();
    this.bindTabSwitching();
    this.bindRightPanelTabs();
    this.bindFeedback();
    this.bindKeyboard();
    this.bindWebSocketEvents();
    this.initPanelResize();
    this.buildShortcutsGrid();

    // Restore panel widths
    this.restorePanelWidths();

    // Update unread count
    this.updateUnreadCount();

    // Show left panel by default (feeds tab)
    this.showPanel('left');
  },

  // --- Panel management ---

  bindPanelButtons() {
    document.getElementById('btn-feeds').addEventListener('click', () => {
      const leftTab = document.querySelector('.panel-tab.active')?.dataset.tab;
      if (this.panels.left.visible && leftTab === 'feeds') {
        this.togglePanel('left');
      } else {
        this.showPanel('left');
        this.switchLeftTab('feeds');
      }
    });
    document.getElementById('btn-briefing').addEventListener('click', () => {
      const leftTab = document.querySelector('.panel-tab.active')?.dataset.tab;
      if (this.panels.left.visible && leftTab === 'briefing') {
        this.togglePanel('left');
      } else {
        this.showPanel('left');
        this.switchLeftTab('briefing');
      }
    });
    document.getElementById('btn-events').addEventListener('click', () => {
      if (this.panels.right.visible && this.currentRightTab === 'events') {
        this.togglePanel('right');
      } else {
        this.showPanel('right');
        this.switchRightTab('events');
      }
    });
    document.getElementById('btn-todo').addEventListener('click', () => {
      if (this.panels.right.visible && this.currentRightTab === 'todo') {
        this.togglePanel('right');
      } else {
        this.showPanel('right');
        this.switchRightTab('todo');
      }
    });
    document.getElementById('btn-settings').addEventListener('click', () => {
      Settings.open();
    });
    document.getElementById('btn-help').addEventListener('click', () => {
      this.toggleShortcutsOverlay();
    });

    // Close buttons
    document.querySelectorAll('.panel-close').forEach(btn => {
      const panelId = btn.dataset.panel;
      if (panelId) {
        btn.addEventListener('click', () => {
          document.getElementById(panelId).classList.add('hidden');
          if (panelId === 'left-panel') this.panels.left.visible = false;
          if (panelId === 'right-panel') this.panels.right.visible = false;
          this.updateButtonStates();
        });
      }
    });
  },

  showPanel(side) {
    const panel = this.panels[side];
    panel.el.classList.remove('hidden');
    panel.visible = true;
    this.updateButtonStates();
  },

  togglePanel(side) {
    const panel = this.panels[side];
    panel.visible = !panel.visible;
    panel.el.classList.toggle('hidden', !panel.visible);
    this.updateButtonStates();
  },

  updateButtonStates() {
    const leftTab = document.querySelector('.panel-tab.active')?.dataset.tab;
    document.getElementById('btn-feeds').classList.toggle('active',
      this.panels.left.visible && leftTab === 'feeds');
    document.getElementById('btn-briefing').classList.toggle('active',
      this.panels.left.visible && leftTab === 'briefing');
    document.getElementById('btn-events').classList.toggle('active',
      this.panels.right.visible && this.currentRightTab === 'events');
    document.getElementById('btn-todo').classList.toggle('active',
      this.panels.right.visible && this.currentRightTab === 'todo');
  },

  // --- Left panel tab switching ---

  bindTabSwitching() {
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchLeftTab(tab.dataset.tab);
      });
    });
  },

  switchLeftTab(tabName) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
    this.updateButtonStates();
  },

  // --- Right panel tab switching ---

  bindRightPanelTabs() {
    document.querySelectorAll('.right-panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchRightTab(tab.dataset.rtab);
      });
    });
  },

  switchRightTab(tabName) {
    this.currentRightTab = tabName;
    document.querySelectorAll('.right-panel-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.rtab === tabName));
    document.querySelectorAll('.rtab-content').forEach(c =>
      c.classList.toggle('active', c.id === `rtab-${tabName}`));
    this.updateButtonStates();

    // Refresh todo when switching to it (in case briefing updated)
    if (tabName === 'todo' && typeof TodoList !== 'undefined') {
      TodoList.refresh();
    }
  },

  // --- Feedback box ---

  bindFeedback() {
    const toggle = document.getElementById('feedback-toggle');
    const box = document.getElementById('feedback-box');
    const submit = document.getElementById('feedback-submit');
    const cancel = document.getElementById('feedback-cancel');
    const textarea = document.getElementById('feedback-text');

    toggle.addEventListener('click', () => box.classList.toggle('hidden'));
    cancel.addEventListener('click', () => {
      box.classList.add('hidden');
      textarea.value = '';
    });

    submit.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) return;

      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          textarea.value = '';
          box.classList.add('hidden');
          this.toast('Feedback saved', 'info');
        }
      } catch (err) {
        console.error('[feedback] Error:', err);
      }
    });
  },

  // --- Keyboard shortcuts ---

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      // If Escape is pressed while any overlay is open, close it first
      if (e.key === 'Escape') {
        const shortcuts = document.getElementById('shortcuts-overlay');
        const settings  = document.getElementById('settings-overlay');
        const feedback  = document.getElementById('feedback-box');
        if (!shortcuts.classList.contains('hidden')) { shortcuts.classList.add('hidden'); return; }
        if (!settings.classList.contains('hidden'))  { settings.classList.add('hidden');  return; }
        if (feedback && !feedback.classList.contains('hidden')) { feedback.classList.add('hidden'); return; }
        if (typeof Palette !== 'undefined' && Palette.visible) { Palette.close(); return; }
      }

      // Feed keyboard navigation (arrow keys, enter, escape)
      const leftTab = document.querySelector('.panel-tab.active')?.dataset.tab;
      if (this.panels.left.visible && leftTab === 'feeds') {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
          Feeds.handleKeyNav(e);
          return;
        }
      }

      switch (e.key.toLowerCase()) {
        case 'f':
          e.preventDefault();
          if (this.panels.left.visible && document.querySelector('.panel-tab.active')?.dataset.tab === 'feeds') {
            this.togglePanel('left');
          } else {
            this.showPanel('left');
            this.switchLeftTab('feeds');
          }
          break;
        case 'b':
          e.preventDefault();
          if (this.panels.left.visible && document.querySelector('.panel-tab.active')?.dataset.tab === 'briefing') {
            this.togglePanel('left');
          } else {
            this.showPanel('left');
            this.switchLeftTab('briefing');
          }
          break;
        case 'e':
          e.preventDefault();
          if (this.panels.right.visible && this.currentRightTab === 'events') {
            this.togglePanel('right');
          } else {
            this.showPanel('right');
            this.switchRightTab('events');
          }
          break;
        case 't':
          e.preventDefault();
          if (this.panels.right.visible && this.currentRightTab === 'todo') {
            this.togglePanel('right');
          } else {
            this.showPanel('right');
            this.switchRightTab('todo');
          }
          break;
        case 's':
          e.preventDefault();
          Settings.open();
          break;
        case '/':
          e.preventDefault();
          this.showPanel('left');
          this.switchLeftTab('briefing');
          Briefing.toggleSearch(true);
          break;
        case '?':
          e.preventDefault();
          this.toggleShortcutsOverlay();
          break;
        case 'escape':
          document.getElementById('settings-overlay').classList.add('hidden');
          document.getElementById('shortcuts-overlay').classList.add('hidden');
          document.getElementById('feedback-box').classList.add('hidden');
          if (typeof Palette !== 'undefined' && Palette.visible) Palette.close();
          Briefing.toggleSearch(false);
          break;
      }
    });
  },

  // --- Toast notifications ---

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      el.addEventListener('transitionend', () => el.remove());
    }, 4000);
  },

  // --- Keyboard shortcut hints ---

  buildShortcutsGrid() {
    const grid = document.getElementById('shortcuts-grid');
    grid.innerHTML = this.shortcuts.map(s =>
      `<div class="shortcut-key"><kbd>${s.key}</kbd></div><div class="shortcut-action">${s.action}</div>`
    ).join('');
  },

  toggleShortcutsOverlay() {
    document.getElementById('shortcuts-overlay').classList.toggle('hidden');
  },

  // --- Map-to-panel linking ---

  showInPanel(markerId, type) {
    // type is passed directly from the popup onclick to avoid a markers-array lookup
    // that could fail if the map is still loading or has been refreshed.
    if (type === 'event') {
      this.showPanel('right');
      this.switchRightTab('events');
      Events.scrollToEvent(markerId);
    } else {
      this.showPanel('left');
      this.switchLeftTab('briefing');
      Briefing.scrollToMarker(markerId);
    }
  },

  // --- Panel resize ---

  initPanelResize() {
    this._createResizeHandle('left-panel', 'right');
    this._createResizeHandle('right-panel', 'left');
  },

  _createResizeHandle(panelId, edgeSide) {
    const panel = document.getElementById(panelId);
    const handle = document.createElement('div');
    handle.className = `panel-resize-handle panel-resize-${edgeSide}`;
    panel.appendChild(handle);

    let startX, startWidth;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = panel.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (e) => {
        const delta = panelId === 'left-panel' ? (e.clientX - startX) : (startX - e.clientX);
        const newWidth = Math.min(700, Math.max(300, startWidth + delta));
        panel.style.width = newWidth + 'px';
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem(`panel-width-${panelId}`, panel.offsetWidth);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  restorePanelWidths() {
    for (const id of ['left-panel', 'right-panel']) {
      const saved = localStorage.getItem(`panel-width-${id}`);
      if (saved) {
        document.getElementById(id).style.width = saved + 'px';
      }
    }
  },

  // --- WebSocket event handlers ---

  bindWebSocketEvents() {
    WS.on('file_changed', (data) => {
      console.log('[ws] File changed:', data.file);
      if (data.file.includes('briefing.md')) {
        Briefing.refresh();
        MapView.refresh();
        this.toast('Briefing updated', 'briefing');
        // Refresh todo briefing actions too
        if (typeof TodoList !== 'undefined') TodoList.loadBriefingActions();
      }
      if (data.file.includes('events.md')) {
        Events.refresh();
        this.toast('Event radar updated', 'events');
      }
      if (data.file.includes('markers.json')) {
        MapView.refresh();
      }
    });

    WS.on('feeds_updated', (data) => {
      console.log('[ws] Feeds updated:', data.count, 'items');
      Feeds.load();
      this.toast(`${data.count} feed items refreshed`, 'feeds');
    });
  },

  // --- Unread count ---

  updateUnreadCount() {
    // Feeds
    const feedUnread = Feeds.getUnreadCount ? Feeds.getUnreadCount() : 0;

    // Map markers
    let markerUnread = 0;
    if (MapView.markers) {
      markerUnread = MapView.markers.filter(m => !ReadTracker.isRead(m.data.id)).length;
    }

    // Total for header badge
    const total = feedUnread + markerUnread;
    const badge = document.getElementById('unread-badge');
    badge.textContent = total;
    badge.classList.toggle('zero', total === 0);

    // Feeds tab badge
    Feeds.updateBadge && Feeds.updateBadge();

    // Briefing tab badge
    const briefingUnread = Briefing.getUnreadCount ? Briefing.getUnreadCount() : 0;
    const briefingBadge = document.getElementById('briefing-unread-badge');
    if (briefingBadge) {
      briefingBadge.textContent = briefingUnread;
      briefingBadge.classList.toggle('zero', briefingUnread === 0);
    }

    // Events tab badges (header + right panel tab)
    const eventsUnread = Events.getUnreadCount ? Events.getUnreadCount() : 0;
    const eventsBadge = document.getElementById('events-unread-badge');
    if (eventsBadge) {
      eventsBadge.textContent = eventsUnread;
      eventsBadge.classList.toggle('zero', eventsUnread === 0);
    }
    const eventsTabBadge = document.getElementById('events-tab-badge');
    if (eventsTabBadge) {
      eventsTabBadge.textContent = eventsUnread;
      eventsTabBadge.classList.toggle('zero', eventsUnread === 0);
    }
  },
};

// --- Boot ---
document.addEventListener('DOMContentLoaded', () => App.init());
