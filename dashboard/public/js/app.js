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
    const wasRead = !!all[id];
    all[id] = Date.now();
    localStorage.setItem(this.KEY, JSON.stringify(all));
    if (!wasRead && typeof LevelSystem !== 'undefined') {
      LevelSystem.reward('feed', id);
    }
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

  SESSION_KEYS: {
    rightVisible: 'cyberspace-right-panel-visible',
    rightTab:     'cyberspace-right-tab',
    leftTab:      'cyberspace-left-tab',
  },

  // The currently displayed report date (syncs map, tasks, unread counts)
  activeDate: null,
  // The date that has the latest events.md (may differ from activeDate)
  eventsSourceDate: null,
  // All dates that have an events.md file (populated by Events.load())
  eventsSourceDates: null,
  // Per-date file manifest from /api/reports — used to skip fetches for missing optional files
  filesByDate: {},

  shortcuts: [
    { key: 'F', action: 'Open Feeds panel' },
    { key: 'B', action: 'Open Briefing panel' },
    { key: 'E', action: 'Toggle Events panel' },
    { key: 'T', action: 'Toggle Task board' },
    { key: 'P', action: 'Toggle Projects panel' },
    { key: 'S', action: 'Open Settings' },
    { key: 'Ctrl+K', action: 'Command palette / > commands' },
    { key: 'Ctrl+F', action: 'Search active panel' },
    { key: '>', action: 'Command mode (direct)' },
    { key: '/', action: 'Toggle Terminal' },
    { key: '?', action: 'Show keyboard shortcuts' },
    { key: '↑ ↓', action: 'Navigate feed items' },
    { key: 'Enter', action: 'Expand selected item' },
    { key: 'Shift+Enter', action: 'Open item externally' },
    { key: 'Esc', action: 'Close overlays / terminal / clear search' },
  ],

  async init() {
    this.panels.left.el = document.getElementById('left-panel');
    this.panels.right.el = document.getElementById('right-panel');

    // Initialize all modules
    WS.init();
    MapView.init();
    Settings.init();
    Palette.init();
    if (typeof Terminal !== 'undefined') Terminal.init();
    this._initNotifications();

    if (typeof MatrixRain !== 'undefined') MatrixRain.init();
    if (typeof VisualFX !== 'undefined') VisualFX.init();
    if (typeof MusicPlayer !== 'undefined') MusicPlayer.init();

    // Load data
    await Promise.all([
      Feeds.init(),
      Briefing.init(),
      Events.init(),
    ]);

    // Set active date to whatever the briefing loaded (respects hash/sessionStorage restore)
    this.activeDate = Briefing.getCurrentDate() || Briefing.dates[0] || null;

    // Now that Events has discovered the eventsSourceDate, reload map with
    // merged news + event markers so event pins are always visible.
    if (this.activeDate) {
      await MapView.loadMarkersForDateWithEvents(this.activeDate, this.eventsSourceDates);
    }

    // Init todo after briefing (needs activeDate)
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
    this.syncLinksButton();
    this.applyIntroAnimations();
    this.renderThreatSparkline();

    // Init leveling system
    if (typeof LevelSystem !== 'undefined') LevelSystem.init();

    // Check for announcement (intercepted transmission)
    if (typeof Announcement !== 'undefined') Announcement.init();

    // Restore panel / tab / terminal state from last session
    this._restoreUIState();
  },

  _saveUIState() {
    sessionStorage.setItem(this.SESSION_KEYS.rightVisible, this.panels.right.visible ? '1' : '0');
    sessionStorage.setItem(this.SESSION_KEYS.rightTab, this.currentRightTab);
    const activeLeftTab = document.querySelector('.panel-tab.active')?.dataset.tab || 'feeds';
    sessionStorage.setItem(this.SESSION_KEYS.leftTab, activeLeftTab);
  },

  _restoreUIState() {
    // Left panel is always shown; restore which tab was active
    const leftTab = sessionStorage.getItem(this.SESSION_KEYS.leftTab) || 'feeds';
    this.showPanel('left');
    this.switchLeftTab(leftTab);

    // Right panel
    const rightVisible = sessionStorage.getItem(this.SESSION_KEYS.rightVisible);
    const rightTab = sessionStorage.getItem(this.SESSION_KEYS.rightTab) || 'events';
    if (rightVisible === '1') {
      this.showPanel('right');
      this.switchRightTab(rightTab);
    }
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
    document.getElementById('btn-projects').addEventListener('click', () => {
      if (this.panels.right.visible && this.currentRightTab === 'projects') {
        this.togglePanel('right');
      } else {
        this.showPanel('right');
        this.switchRightTab('projects');
      }
    });
    document.getElementById('btn-terminal').addEventListener('click', () => {
      if (typeof Terminal !== 'undefined' && typeof Terminal.toggle === 'function') Terminal.toggle();
    });
    document.getElementById('btn-settings').addEventListener('click', () => {
      Settings.open();
    });
    document.getElementById('btn-help').addEventListener('click', () => {
      this.toggleShortcutsOverlay();
    });
    document.getElementById('btn-links').addEventListener('click', () => {
      if (typeof MapView !== 'undefined' && typeof MapView.toggleConnections === 'function') {
        const on = MapView.toggleConnections();
        this.syncLinksButton();
        this.toast(on ? 'Marker links: ON' : 'Marker links: OFF', 'info');
      }
    });

    // Close buttons
    document.querySelectorAll('.panel-close').forEach(btn => {
      const panelId = btn.dataset.panel;
      if (panelId) {
        btn.addEventListener('click', () => {
          if (panelId === 'left-panel') this.hidePanel('left');
          else if (panelId === 'right-panel') this.hidePanel('right');
          else {
            document.getElementById(panelId).classList.add('hidden');
            this.updateButtonStates();
          }
        });
      }
    });
  },

  /**
   * Set the active viewing date — syncs map markers, tasks panel,
   * and unread counts to the specified report date.
   */
  async setActiveDate(date) {
    if (!date || date === this.activeDate) return;
    this.activeDate = date;

    // Load news markers for this date + event markers from all events.md files
    await MapView.loadMarkersForDateWithEvents(date, this.eventsSourceDates);

    // Sync briefing cross-link data
    if (MapView.markers) {
      Briefing.setMarkers(MapView.markers.map(m => m.data));
    }

    // Refresh tasks panel to show this date's actions + further reading
    await TodoList.loadBriefingContentForDate(date);

    // Load announcement for this specific date
    if (typeof Announcement !== 'undefined') Announcement.initForDate(date);

    // Update badges for this date
    this.updateUnreadCount();
  },

  showPanel(side) {
    const panel = this.panels[side];
    const wasHidden = panel.el.classList.contains('hidden');
    panel.el.classList.remove('hidden');
    panel.visible = true;
    this.updateButtonStates();
    this._syncTerminalBounds();
    if (side === 'right') this._saveUIState();
    // Visual FX: border glitch when opening (not when already visible)
    if (wasHidden && typeof VisualFX !== 'undefined') {
      VisualFX.panelGlitch(panel.el.id);
    }
  },

  hidePanel(side) {
    const panel = this.panels[side];
    panel.el.classList.add('hidden');
    panel.visible = false;
    this.updateButtonStates();
    this._syncTerminalBounds();
    if (side === 'right') this._saveUIState();
  },

  togglePanel(side) {
    const panel = this.panels[side];
    panel.visible = !panel.visible;
    panel.el.classList.toggle('hidden', !panel.visible);
    this.updateButtonStates();
    this._syncTerminalBounds();
    if (side === 'right') this._saveUIState();
  },

  _syncTerminalBounds() {
    const terminal = document.getElementById('terminal-panel');
    if (!terminal) return;
    const leftPanel = this.panels.left?.el;
    const rightPanel = this.panels.right?.el;
    const leftW = leftPanel && !leftPanel.classList.contains('hidden') ? leftPanel.offsetWidth : 0;
    const rightW = rightPanel && !rightPanel.classList.contains('hidden') ? rightPanel.offsetWidth : 0;
    terminal.style.left = leftW + 'px';
    terminal.style.right = rightW + 'px';
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
    document.getElementById('btn-projects').classList.toggle('active',
      this.panels.right.visible && this.currentRightTab === 'projects');
  },

  syncLinksButton() {
    const btn = document.getElementById('btn-links');
    if (!btn || typeof MapView === 'undefined') return;
    btn.classList.toggle('active', !!MapView.linksEnabled);
  },

  applyIntroAnimations() {
    const left = document.getElementById('left-panel');
    const right = document.getElementById('right-panel');
    const terminal = document.getElementById('terminal-panel');
    if (left && !left.classList.contains('hidden')) left.classList.add('panel-intro');
    if (right && !right.classList.contains('hidden')) right.classList.add('panel-intro');
    if (terminal && !terminal.classList.contains('hidden')) terminal.classList.add('panel-intro');
    setTimeout(() => {
      if (left) left.classList.remove('panel-intro');
      if (right) right.classList.remove('panel-intro');
      if (terminal) terminal.classList.remove('panel-intro');
    }, 420);
  },

  async renderThreatSparkline() {
    const host = document.getElementById('threat-sparkline');
    if (!host || typeof Briefing === 'undefined') return;

    const dates = (Briefing.dates || []).slice(0, 7).reverse();
    if (dates.length === 0) {
      host.innerHTML = '';
      return;
    }

    const results = await Promise.all(dates.map(async (date) => {
      try {
        const res = await fetch(`/api/file?path=reports/${date}/briefing.md`);
        if (!res.ok) return null;
        const md = await res.text();
        return this._threatScoreFromMarkdown(md);
      } catch { return null; }
    }));
    const scores = results.filter(s => s !== null);

    if (scores.length === 0) {
      host.innerHTML = '';
      return;
    }

    const w = 96;
    const h = 18;
    const step = scores.length > 1 ? w / (scores.length - 1) : w;
    const y = (s) => h - ((s - 1) / 3) * (h - 2) - 1;
    const points = scores.map((s, i) => `${(i * step).toFixed(1)},${y(s).toFixed(1)}`).join(' ');
    const lastY = y(scores[scores.length - 1]).toFixed(1);

    host.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="threat-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#00ff41"/>
            <stop offset="50%" stop-color="#ffd700"/>
            <stop offset="100%" stop-color="#ff3333"/>
          </linearGradient>
        </defs>
        <polyline points="${points}" fill="none" stroke="url(#threat-grad)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${(scores.length - 1) * step}" cy="${lastY}" r="2" fill="var(--text-bright)"/>
      </svg>
    `;
  },

  _threatScoreFromMarkdown(markdown) {
    const text = String(markdown || '').toUpperCase();
    if (/CRITICAL|SEVERE|🔴/.test(text)) return 4;
    if (/HIGH|🟠/.test(text)) return 3;
    if (/ELEVATED|MEDIUM|🟡/.test(text)) return 2;
    return 1;
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
    this._saveUIState();
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
    this._saveUIState();

    // Refresh todo when switching to it (in case briefing updated)
    if (tabName === 'todo' && typeof TodoList !== 'undefined') {
      TodoList.refresh();
    }
    // Init/refresh projects panel when switching to it
    if (tabName === 'projects' && typeof Projects !== 'undefined') {
      Projects.init();
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

      const hasCtrl  = e.ctrlKey || e.metaKey;
      const hasShift = e.shiftKey;
      const hasAlt   = e.altKey;
      const key      = e.key;

      // If Escape is pressed while any overlay is open, close it first
      if (key === 'Escape') {
        const shortcuts = document.getElementById('shortcuts-overlay');
        const settings  = document.getElementById('settings-overlay');
        const feedback  = document.getElementById('feedback-box');
        if (!shortcuts.classList.contains('hidden')) { shortcuts.classList.add('hidden'); return; }
        if (!settings.classList.contains('hidden'))  { settings.classList.add('hidden');  return; }
        if (feedback && !feedback.classList.contains('hidden')) { feedback.classList.add('hidden'); return; }
        if (typeof Palette !== 'undefined' && Palette.visible) { Palette.close(); return; }
        const terminalPanel = document.getElementById('terminal-panel');
        if (terminalPanel && !terminalPanel.classList.contains('hidden')) {
          if (typeof Terminal !== 'undefined' && typeof Terminal.close === 'function') Terminal.close();
          return;
        }
      }

      // Feed keyboard navigation (arrow keys, enter, escape)
      const leftTab = document.querySelector('.panel-tab.active')?.dataset.tab;
      if (this.panels.left.visible && leftTab === 'feeds') {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(key)) {
          Feeds.handleKeyNav(e);
          return;
        }
      }

      // ── Ctrl combos (checked first so plain keys below are modifier-free) ──

      // Ctrl+/ → Toggle terminal
      if (hasCtrl && key === '/') {
        e.preventDefault();
        if (typeof Terminal !== 'undefined' && typeof Terminal.toggle === 'function') Terminal.toggle();
        return;
      }

      // Ctrl+F → Search in active left tab (briefing or feeds)
      if (hasCtrl && key.toLowerCase() === 'f') {
        e.preventDefault();
        this.showPanel('left');
        const activeTab = document.querySelector('.panel-tab.active')?.dataset.tab;
        if (activeTab === 'feeds') {
          const feedsSearch = document.getElementById('feeds-search');
          if (feedsSearch) feedsSearch.focus();
        } else {
          this.switchLeftTab('briefing');
          Briefing.toggleSearch(true);
        }
        return;
      }

      // Skip any remaining combos that have Ctrl/Alt so they don't hit the bare-key switch
      if (hasCtrl || hasAlt) return;

      // ── Bare keys (no Ctrl, no Alt — Shift is checked per-case) ──
      switch (key) {
        case 'f':
        case 'F':
          if (hasShift) break; // Shift+F → ignore
          e.preventDefault();
          if (this.panels.left.visible && document.querySelector('.panel-tab.active')?.dataset.tab === 'feeds') {
            this.togglePanel('left');
          } else {
            this.showPanel('left');
            this.switchLeftTab('feeds');
          }
          break;
        case 'b':
        case 'B':
          if (hasShift) break;
          e.preventDefault();
          if (this.panels.left.visible && document.querySelector('.panel-tab.active')?.dataset.tab === 'briefing') {
            this.togglePanel('left');
          } else {
            this.showPanel('left');
            this.switchLeftTab('briefing');
          }
          break;
        case 'e':
        case 'E':
          if (hasShift) break;
          e.preventDefault();
          if (this.panels.right.visible && this.currentRightTab === 'events') {
            this.togglePanel('right');
          } else {
            this.showPanel('right');
            this.switchRightTab('events');
          }
          break;
        case 't':
        case 'T':
          if (hasShift) break;
          e.preventDefault();
          if (this.panels.right.visible && this.currentRightTab === 'todo') {
            this.togglePanel('right');
          } else {
            this.showPanel('right');
            this.switchRightTab('todo');
          }
          break;
        case 'p':
        case 'P':
          if (hasShift) break;
          e.preventDefault();
          if (this.panels.right.visible && this.currentRightTab === 'projects') {
            this.togglePanel('right');
          } else {
            this.showPanel('right');
            this.switchRightTab('projects');
          }
          break;
        case 's':
        case 'S':
          if (hasShift) break;
          e.preventDefault();
          Settings.open();
          break;
        case '/':
          e.preventDefault();
          if (typeof Terminal !== 'undefined' && typeof Terminal.toggle === 'function') Terminal.toggle();
          break;
        case '?':
          e.preventDefault();
          this.toggleShortcutsOverlay();
          break;
        case '>':
          e.preventDefault();
          Palette.openCommandMode();
          break;
        case 'Escape':
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
    const overlay = document.getElementById('shortcuts-overlay');
    overlay.classList.toggle('hidden');
    // Bind click-outside-to-close once, on first open
    if (!overlay._clickOutsideBound) {
      overlay._clickOutsideBound = true;
      overlay.addEventListener('click', (e) => {
        if (!e.target.closest('.shortcuts-content')) {
          overlay.classList.add('hidden');
        }
      });
    }
  },

  // --- Desktop notifications ---

  _initNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    // Request permission only after the first user gesture (required by browsers).
    const request = () => {
      if (Notification.permission === 'default') Notification.requestPermission();
      document.removeEventListener('click', request);
      document.removeEventListener('keydown', request);
    };
    document.addEventListener('click', request, { once: true });
    document.addEventListener('keydown', request, { once: true });
  },

  _sendDesktopNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, tag: 'cyberspace-alert' });
    setTimeout(() => n.close(), 8000);
    n.onclick = () => { window.focus(); n.close(); };
  },

  _notifyCriticalThreats() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const criticals = (MapView.markers || []).filter(
      m => m.data?.priority === 'critical' && !ReadTracker.isRead(m.data?.id)
    );
    if (criticals.length === 0) return;
    if (typeof MatrixRain !== 'undefined') MatrixRain.intensify();
    const sample = criticals
      .slice(0, 2)
      .map(m => m.data?.title || '(no title)')
      .join('; ');
    const title = `\uD83D\uDD34 ${criticals.length} CRITICAL Threat${criticals.length !== 1 ? 's' : ''}`;
    this._sendDesktopNotification(title, sample);
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

      const terminalPanel = document.getElementById('terminal-panel');
      if (terminalPanel) terminalPanel.classList.add('resizing');

      const onMove = (e) => {
        const delta = panelId === 'left-panel' ? (e.clientX - startX) : (startX - e.clientX);
        const newWidth = Math.min(700, Math.max(300, startWidth + delta));
        panel.style.width = newWidth + 'px';
        this._syncTerminalBounds();
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem(`panel-width-${panelId}`, panel.offsetWidth);
        if (terminalPanel) terminalPanel.classList.remove('resizing');
        this._syncTerminalBounds();
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
    this._syncTerminalBounds();
  },

  // --- WebSocket event handlers ---

  bindWebSocketEvents() {
    WS.on('file_changed', async (data) => {
      console.log('[ws] File changed:', data.file);
      if (data.file.includes('briefing.md')) {
        await Briefing.loadDates();
        this.renderThreatSparkline();
        const latestDate = Briefing.dates[0];
        // If user is viewing the latest date, auto-advance
        if (!this.activeDate || this.activeDate === latestDate || Briefing.currentIndex === 0) {
          Briefing.refresh();
          this.activeDate = latestDate;
          await MapView.loadMarkersForDateWithEvents(latestDate, this.eventsSourceDates);
          if (typeof TodoList !== 'undefined') TodoList.loadBriefingContentForDate(latestDate);
          this.updateUnreadCount();
          this._notifyCriticalThreats();
        } else {
          // User is viewing older date — don't disrupt, just notify
          this.toast('New briefing available — navigate to latest to view', 'briefing');
        }
        this.toast('Briefing updated', 'briefing');
        // Visual FX: flash + glitch on new briefing
        if (typeof VisualFX !== 'undefined') {
          VisualFX.dataFlash('left-panel');
          VisualFX.glitch('#threat-badge');
          VisualFX.notifyButton('btn-briefing');
        }
      }
      if (data.file.includes('events.md')) {
        Events.refresh();
        this.toast('Event radar updated', 'events');
        if (typeof VisualFX !== 'undefined') {
          VisualFX.dataFlash('right-panel');
          VisualFX.notifyButton('btn-events');
        }
      }
      if (data.file.includes('markers.json')) {
        // Only auto-refresh map if viewing the latest date
        if (!this.activeDate || this.activeDate === Briefing.dates[0]) {
          MapView.loadMarkersForDateWithEvents(this.activeDate, this.eventsSourceDates);
        }
      }
    });

    WS.on('feeds_updated', (data) => {
      console.log('[ws] Feeds updated:', data.count, 'items');
      Feeds.load();
      this.toast(`${data.count} feed items refreshed`, 'feeds');
      if (typeof VisualFX !== 'undefined') {
        VisualFX.dataFlash('left-panel');
        VisualFX.notifyButton('btn-feeds');
      }
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

// Expose App globally for inline onclick handlers in popups
window.App = App;
