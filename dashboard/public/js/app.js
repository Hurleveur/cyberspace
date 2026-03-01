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

  async init() {
    // Cache panel elements
    this.panels.left.el = document.getElementById('left-panel');
    this.panels.right.el = document.getElementById('right-panel');

    // Initialize all modules
    WS.init();
    MapView.init();
    Settings.init();

    // Load data
    await Promise.all([
      Feeds.init(),
      Briefing.init(),
      Events.init(),
    ]);

    // Bind UI events
    this.bindPanelButtons();
    this.bindTabSwitching();
    this.bindFeedback();
    this.bindKeyboard();
    this.bindWebSocketEvents();

    // Update unread count
    this.updateUnreadCount();

    // Show left panel by default (feeds tab)
    this.showPanel('left');
  },

  // --- Panel management ---

  bindPanelButtons() {
    document.getElementById('btn-feeds').addEventListener('click', () => {
      this.showPanel('left');
      this.switchLeftTab('feeds');
    });
    document.getElementById('btn-briefing').addEventListener('click', () => {
      this.showPanel('left');
      this.switchLeftTab('briefing');
    });
    document.getElementById('btn-events').addEventListener('click', () => {
      this.togglePanel('right');
    });
    document.getElementById('btn-settings').addEventListener('click', () => {
      Settings.open();
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
    document.getElementById('btn-events').classList.toggle('active', this.panels.right.visible);
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

      switch (e.key.toLowerCase()) {
        case 'f':
          e.preventDefault();
          this.showPanel('left');
          this.switchLeftTab('feeds');
          break;
        case 'b':
          e.preventDefault();
          this.showPanel('left');
          this.switchLeftTab('briefing');
          break;
        case 'e':
          e.preventDefault();
          this.togglePanel('right');
          break;
        case 's':
          e.preventDefault();
          Settings.open();
          break;
        case 'escape':
          // Close overlays/panels
          document.getElementById('settings-overlay').classList.add('hidden');
          document.getElementById('feedback-box').classList.add('hidden');
          break;
      }
    });
  },

  // --- WebSocket event handlers ---

  bindWebSocketEvents() {
    WS.on('file_changed', (data) => {
      console.log('[ws] File changed:', data.file);
      if (data.file.includes('briefing.md')) {
        Briefing.refresh();
        MapView.refresh();
      }
      if (data.file.includes('events.md')) {
        Events.refresh();
      }
      if (data.file.includes('markers.json')) {
        MapView.refresh();
      }
    });

    WS.on('feeds_updated', (data) => {
      console.log('[ws] Feeds updated:', data.count, 'items');
      Feeds.load();
    });
  },

  // --- Unread count ---

  updateUnreadCount() {
    // Count unread feeds
    const feedUnread = Feeds.getUnreadCount ? Feeds.getUnreadCount() : 0;

    // Count unread map markers
    let markerUnread = 0;
    if (MapView.markers) {
      markerUnread = MapView.markers.filter(m => !ReadTracker.isRead(m.data.id)).length;
    }

    const total = feedUnread + markerUnread;
    const badge = document.getElementById('unread-badge');
    badge.textContent = total;
    badge.classList.toggle('zero', total === 0);

    // Also update feeds tab badge
    Feeds.updateBadge && Feeds.updateBadge();
  },
};

// --- Boot ---
document.addEventListener('DOMContentLoaded', () => App.init());
