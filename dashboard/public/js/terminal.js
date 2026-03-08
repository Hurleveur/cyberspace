/**
 * Terminal — bottom-panel command interface.
 * cyberspace> _
 *
 * Commands: events, feeds, briefing, map, config, status, threat,
 *           unread, search, feedback, mark-read, refresh, clear,
 *           help, shortcuts, theme, crt, vignette, effects
 */
const Terminal = {
  _history: [],
  _historyIndex: -1,
  _HISTORY_KEY: 'cyberspace-terminal-history',
  _SESSION_KEY: 'cyberspace-terminal-visible',
  _visible: false,

  // ---------- Lifecycle ----------

  init() {
    this._el     = document.getElementById('terminal-panel');
    this._output = document.getElementById('terminal-output');
    this._input  = document.getElementById('terminal-input');

    if (!this._el || !this._output || !this._input) {
      console.warn('[terminal] DOM elements not found — skipping init');
      return;
    }

    this._loadHistory();

    this._input.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          this._submit();
          break;
        case 'Tab':
          e.preventDefault();
          this._tabComplete();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this._historyNav(1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this._historyNav(-1);
          break;
        case 'Escape':
          this.close();
          break;
      }
    });

    document.getElementById('terminal-close').addEventListener('click', () => this.close());

    this._print('Cyberspace terminal ready. Type <span class="t-accent">help</span> for commands.', 'info');

    // Restore open state from last session
    if (sessionStorage.getItem(this._SESSION_KEY) === '1') this.open();
  },

  open() {
    if (!this._el) return;
    this._el.classList.remove('hidden');
    this._visible = true;
    sessionStorage.setItem(this._SESSION_KEY, '1');
    requestAnimationFrame(() => this._input.focus());
  },

  close() {
    if (!this._el) return;
    this._el.classList.add('hidden');
    this._visible = false;
    sessionStorage.setItem(this._SESSION_KEY, '0');
  },

  toggle() {
    this._visible ? this.close() : this.open();
  },

  focus() {
    if (!this._visible) this.open();
    this._input.focus();
  },

  // ---------- Output ----------

  _print(html, type = 'output') {
    const line = document.createElement('div');
    line.className = `t-line t-${type}`;
    line.innerHTML = html;
    this._output.appendChild(line);
    this._output.scrollTop = this._output.scrollHeight;
  },

  _printText(text, type = 'output') {
    this._print(this._escape(text), type);
  },

  _escape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  _echoCmd(raw) {
    this._print(`<span class="t-prompt-echo">cyberspace&gt;</span> <span class="t-cmd-echo">${this._escape(raw)}</span>`, 'cmd');
  },

  clear() {
    this._output.innerHTML = '';
  },

  // ---------- Submission ----------

  _submit() {
    const raw = this._input.value.trim();
    this._input.value = '';
    this._historyIndex = -1;
    if (!raw) return;
    this._echoCmd(raw);
    this._saveHistory(raw);
    this._execute(raw);
  },

  // ---------- History ----------

  _loadHistory() {
    try { this._history = JSON.parse(localStorage.getItem(this._HISTORY_KEY) || '[]'); }
    catch { this._history = []; }
  },

  _saveHistory(cmd) {
    this._history = [cmd, ...this._history.filter(h => h !== cmd)].slice(0, 100);
    localStorage.setItem(this._HISTORY_KEY, JSON.stringify(this._history));
  },

  _historyNav(dir) {
    const next = this._historyIndex + dir;
    if (next < -1 || next >= this._history.length) return;
    this._historyIndex = next;
    this._input.value = next === -1 ? '' : this._history[next];
    // Move cursor to end
    const len = this._input.value.length;
    setTimeout(() => this._input.setSelectionRange(len, len), 0);
  },

  // ---------- Tab Completion ----------

  _CMDS: ['events', 'feeds', 'briefing', 'map', 'config', 'status', 'threat',
          'unread', 'search', 'feedback', 'mark-read', 'refresh', 'clear',
          'help', 'shortcuts', 'theme', 'crt', 'vignette', 'effects', 'intercept',
          'export', 'import'],

  _tabComplete() {
    const val = this._input.value;
    const parts = val.split(/\s+/);
    const first = parts[0].toLowerCase();

    if (parts.length === 1) {
      // Complete command name
      const matches = this._CMDS.filter(c => c.startsWith(first));
      if (matches.length === 1) {
        this._input.value = matches[0] + ' ';
      } else if (matches.length > 1) {
        this._print(matches.join('  '), 'info');
        // Complete to longest common prefix
        const prefix = matches.reduce((p, c) => {
          let i = 0; while (i < p.length && p[i] === c[i]) i++;
          return p.slice(0, i);
        });
        this._input.value = prefix;
      }
    } else if (first === 'config') {
      const ARGS = ['interests', 'news', 'events', 'rss', 'feedback'];
      const partial = (parts[1] || '').toLowerCase();
      const matches = ARGS.filter(a => a.startsWith(partial));
      if (matches.length === 1) this._input.value = `config ${matches[0]}`;
      else if (matches.length > 1) this._print(matches.join('  '), 'info');
    } else if (first === 'theme') {
      const THEMES = ['green', 'amber', 'cyan'];
      const partial = (parts[1] || '').toLowerCase();
      const matches = THEMES.filter(t => t.startsWith(partial));
      if (matches.length === 1) this._input.value = `theme ${matches[0]}`;
      else if (matches.length > 1) this._print(matches.join('  '), 'info');
    }
  },

  // ---------- Parser + Dispatcher ----------

  _execute(raw) {
    const tokens = raw.trim().split(/\s+/);
    const cmd = tokens[0].toLowerCase();
    const args = tokens.slice(1).filter(t => !t.startsWith('--'));
    const flags = tokens.slice(1)
      .filter(t => t.startsWith('--'))
      .map(t => t.slice(2).toLowerCase());
    const flagMap = {};
    for (let i = 0; i < flags.length; i++) flagMap[flags[i]] = args[i] || true;

    switch (cmd) {
      case 'events':   return this._cmdEvents(flags, args);
      case 'feeds':    return this._cmdFeeds(flags, args);
      case 'briefing': return this._cmdBriefing(flags, args);
      case 'map':      return this._cmdMap();
      case 'config':   return this._cmdConfig(args);
      case 'status':   return this._cmdStatus();
      case 'threat':   return this._cmdThreat();
      case 'unread':   return this._cmdUnread();
      case 'search':   return this._cmdSearch(args.join(' '));
      case 'feedback': return this._cmdFeedback(tokens.slice(1).join(' '));
      case 'mark-read':return this._cmdMarkRead();
      case 'refresh':  return this._cmdRefresh(args);
      case 'clear':    return this.clear();
      case 'help':     return this._cmdHelp(args[0]);
      case 'shortcuts':return this._cmdShortcuts();
      case 'theme':    return this._cmdTheme(args[0]);
      case 'crt':      return this._cmdCRT();
      case 'vignette': return this._cmdVignette();
      case 'effects':  return this._cmdEffects();
      case 'intercept': return this._cmdIntercept(args[0]);
      case 'export':    return this._cmdExport();
      case 'import':    return this._cmdImport(flags.includes('replace') ? 'replace' : 'merge');
      default:
        this._print(`Unknown command: <span class="t-accent">${this._escape(cmd)}</span>. Type <span class="t-accent">help</span> for a list.`, 'error');
    }
  },

  // ---------- Commands ----------

  _cmdEvents(flags, args) {
    // Open events panel
    App.showPanel('right');
    App.switchRightTab('events');

    if (flags.includes('priority') || flags.includes('score')) {
      document.getElementById('events-filter-score').value = '0';
      Events.applyFilters();
      Events.sortByScore();
      this._print('Events panel open — sorted by relevance score (highest first).', 'success');
    } else if (flags.includes('date')) {
      document.getElementById('events-filter-urgency').value = '';
      Events.applyFilters();
      this._print('Events panel open — sorted by date (soonest first).', 'success');
    } else if (flags.includes('cost')) {
      document.getElementById('events-filter-cost').value = 'free';
      Events.applyFilters();
      this._print('Events panel open — showing free events first.', 'success');
    } else {
      const count = (Events.filteredEvents || Events.events || []).length;
      this._print(`Events panel open — ${count} event${count !== 1 ? 's' : ''} loaded.`, 'success');
    }
  },

  _cmdFeeds(flags, args) {
    App.showPanel('left');
    App.switchLeftTab('feeds');

    if (flags.includes('critical')) {
      document.getElementById('feeds-filter-priority').value = 'HIGH';
      Feeds.applyFilters();
      this._print('Feeds panel open — showing HIGH priority only.', 'success');
    } else if (flags.includes('category')) {
      const cat = args[0];
      if (cat) {
        const sel = document.getElementById('feeds-filter-category');
        // Try to find matching option
        const opt = Array.from(sel.options).find(o => o.value.toLowerCase().includes(cat.toLowerCase()));
        if (opt) {
          sel.value = opt.value;
          Feeds.applyFilters();
          this._print(`Feeds panel open — filtered to category: ${opt.value}`, 'success');
        } else {
          Feeds.applyFilters();
          this._print(`Feeds panel open. Category "${this._escape(cat)}" not found — showing all.`, 'info');
        }
      } else {
        this._print('Usage: <span class="t-accent">feeds --category &lt;name&gt;</span>', 'info');
      }
    } else {
      const count = Feeds.getUnreadCount ? Feeds.getUnreadCount() : '?';
      this._print(`Feeds panel open — ${count} unread items.`, 'success');
    }
  },

  _cmdBriefing(flags, args) {
    App.showPanel('left');
    App.switchLeftTab('briefing');

    if (args.length > 0) {
      const date = args[0];
      // Validate date format
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const idx = Briefing.dates.indexOf(date);
        if (idx !== -1) {
          Briefing.currentIndex = idx;
          Briefing.loadBriefing(date);
          Briefing.updateNav();
          Briefing._setHashDate(date);
          App.setActiveDate(date);
          this._print(`Navigated to briefing: <span class="t-accent">${date}</span>`, 'success');
        } else {
          this._print(`No briefing found for <span class="t-accent">${this._escape(date)}</span>. Available: ${Briefing.dates.slice(0, 5).join(', ')}`, 'error');
        }
      } else {
        this._print('Date format must be <span class="t-accent">YYYY-MM-DD</span>.', 'error');
      }
    } else {
      const date = App.activeDate || Briefing.dates[0];
      this._print(`Briefing panel open — viewing <span class="t-accent">${date || 'latest'}</span>`, 'success');
    }
  },

  _cmdMap() {
    App.hidePanel('left');
    App.hidePanel('right');
    this._print('All panels closed — map focused.', 'success');
  },

  _cmdConfig(args) {
    const FILES = { interests: 'interests.md', news: 'news.md', events: 'events.md', rss: 'rss.md', feedback: 'feedback.md' };
    if (!args[0]) {
      this._print('Config files:', 'info');
      for (const [key, file] of Object.entries(FILES)) {
        this._print(`  <span class="t-accent">${key}</span> → ${file}`, 'output');
      }
      this._print('Usage: <span class="t-accent">config &lt;interests|news|events|rss|feedback&gt;</span>', 'info');
      return;
    }
    const key = args[0].toLowerCase();
    const file = FILES[key];
    if (!file) {
      this._print(`Unknown config: <span class="t-accent">${this._escape(key)}</span>. Options: ${Object.keys(FILES).join(', ')}`, 'error');
      return;
    }
    // Map to settings tab
    const tabMap = { 'interests.md': 'Interests', 'news.md': 'News', 'events.md': 'Events', 'rss.md': 'RSS Feeds', 'feedback.md': null };
    Settings.open();
    if (tabMap[file]) {
      const tab = Array.from(document.querySelectorAll('.settings-tab')).find(t => t.textContent.trim() === tabMap[file]);
      if (tab) tab.click();
    } else {
      // feedback.md — just open settings
    }
    this._print(`Settings panel open → <span class="t-accent">${file}</span>`, 'success');
  },

  _cmdStatus() {
    const latestBriefing = Briefing.dates[0] || 'none';
    const totalBriefings = Briefing.dates.length;
    const feedCount = Feeds.items ? Feeds.items.length : '?';
    const feedUnread = Feeds.getUnreadCount ? Feeds.getUnreadCount() : '?';
    const markerCount = MapView.markers ? MapView.markers.length : 0;
    const markerUnread = MapView.markers ? MapView.markers.filter(m => !ReadTracker.isRead(m.data.id)).length : 0;
    const eventsLoaded = (Events.events || []).length;
    const streakEl = document.getElementById('streak-badge');
    const streak = streakEl ? streakEl.textContent : '?';
    const threatLabel = document.getElementById('threat-label');
    const threat = threatLabel ? threatLabel.textContent : 'UNKNOWN';

    this._print('─── System Status ──────────────────────────', 'info');
    this._print(`  Latest briefing : <span class="t-accent">${latestBriefing}</span>  (${totalBriefings} total)`, 'output');
    this._print(`  Streak          : <span class="t-accent">${streak}</span>`, 'output');
    this._print(`  Threat level    : <span class="t-accent">${threat}</span>`, 'output');
    this._print(`  Map markers     : <span class="t-accent">${markerCount}</span>  (${markerUnread} unread)`, 'output');
    this._print(`  Feed items      : <span class="t-accent">${feedCount}</span>  (${feedUnread} unread)`, 'output');
    this._print(`  Events loaded   : <span class="t-accent">${eventsLoaded}</span>`, 'output');
    this._print('────────────────────────────────────────────', 'info');
  },

  _cmdThreat() {
    const badge = document.getElementById('threat-badge');
    const label = document.getElementById('threat-label');
    if (!label) { this._print('No threat data yet.', 'info'); return; }

    const level = label.textContent;
    const cl = badge.className;
    let emoji = '🟢';
    if (cl.includes('critical')) emoji = '🔴';
    else if (cl.includes('high'))     emoji = '🟠';
    else if (cl.includes('medium'))   emoji = '🟡';

    // Try to read the briefing threat line from current briefing content
    const briefingEl = document.getElementById('briefing-content');
    let summary = '';
    if (briefingEl) {
      const pEls = Array.from(briefingEl.querySelectorAll('p'));
      const threatP = pEls.find(p => p.textContent.match(/threat level|overall threat/i));
      if (threatP) summary = threatP.textContent.trim().slice(0, 120);
    }

    this._print(`${emoji} Threat level: <span class="t-accent">${level}</span>`, level === 'CRITICAL' || level === 'SEVERE' ? 'error' : 'output');
    if (summary) this._print(`   ${this._escape(summary)}`, 'info');
    else this._print(`   Open briefing for details — <span class="t-accent">briefing</span>`, 'info');
  },

  _cmdUnread() {
    const feedUnread = Feeds.getUnreadCount ? Feeds.getUnreadCount() : 0;
    const markerUnread = MapView.markers ? MapView.markers.filter(m => !ReadTracker.isRead(m.data.id)).length : 0;
    const eventsUnread = Events.getUnreadCount ? Events.getUnreadCount() : 0;
    const total = feedUnread + markerUnread + eventsUnread;

    this._print(`─── Unread Items (${total} total) ───────────────`, 'info');
    this._print(`  Feeds          : <span class="t-accent">${feedUnread}</span>`, 'output');
    this._print(`  Map markers    : <span class="t-accent">${markerUnread}</span>  (news / CVEs / breaches)`, 'output');
    this._print(`  Events         : <span class="t-accent">${eventsUnread}</span>`, 'output');

    // List critical unread markers
    if (MapView.markers) {
      const critUnread = MapView.markers.filter(m => m.data.priority === 'critical' && !ReadTracker.isRead(m.data.id));
      if (critUnread.length > 0) {
        this._print('  Critical unread:', 'error');
        critUnread.slice(0, 5).forEach(m => {
          this._print(`    🔴 ${this._escape(m.data.title)}`, 'error');
        });
        if (critUnread.length > 5) this._print(`    … and ${critUnread.length - 5} more`, 'error');
      }
    }
    this._print('────────────────────────────────────────────', 'info');
    if (total === 0) this._print('  All caught up ✓', 'success');
  },

  _cmdSearch(query) {
    if (!query) { this._print('Usage: <span class="t-accent">search &lt;query&gt;</span>', 'info'); return; }

    let results = 0;
    const q = query.toLowerCase();

    // Search briefing
    App.showPanel('left');
    App.switchLeftTab('briefing');
    Briefing.toggleSearch(true);
    const si = document.getElementById('briefing-search-input');
    if (si) {
      si.value = query;
      si.dispatchEvent(new Event('input'));
      // Allow search to process before reading count
      setTimeout(() => {
        const count = document.getElementById('briefing-search-count');
        this._print(`Briefing search for "<span class="t-accent">${this._escape(query)}</span>" — ${count ? count.textContent : 'checking...'}`, 'success');
      }, 300);
    }

    // Also check feed items
    if (Feeds.items) {
      const feedMatches = Feeds.items.filter(item =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.summary || '').toLowerCase().includes(q)
      );
      if (feedMatches.length > 0) {
        this._print(`Also found in feeds: <span class="t-accent">${feedMatches.length}</span> item${feedMatches.length !== 1 ? 's' : ''}`, 'info');
        feedMatches.slice(0, 3).forEach(item => {
          this._print(`  📡 ${this._escape((item.title || '').slice(0, 80))}`, 'output');
        });
      }
    }

    // Check events
    if (Events.events) {
      const evMatches = Events.events.filter(ev =>
        (ev.name || '').toLowerCase().includes(q) ||
        (ev.why || '').toLowerCase().includes(q)
      );
      if (evMatches.length > 0) {
        this._print(`Also found in events: <span class="t-accent">${evMatches.length}</span> event${evMatches.length !== 1 ? 's' : ''}`, 'info');
        evMatches.slice(0, 3).forEach(ev => {
          this._print(`  📅 ${this._escape((ev.name || '').slice(0, 80))}`, 'output');
        });
      }
    }
  },

  async _cmdFeedback(text) {
    if (!text) { this._print('Usage: <span class="t-accent">feedback &lt;your text&gt;</span>', 'info'); return; }
    try {
      const ts = new Date().toISOString().slice(0, 10);
      const body = `\n[${ts}] ${text}`;
      const resp = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (resp.ok) {
        this._print('Feedback appended to feedback.md ✓', 'success');
      } else {
        this._print('Failed to save feedback — server error.', 'error');
      }
    } catch (err) {
      this._print(`Error: ${this._escape(err.message)}`, 'error');
    }
  },

  _cmdMarkRead() {
    const ids = [
      ...(MapView.markers || []).map(m => m.data.id),
      ...(Feeds.items || []).map(f => f.id),
      ...(Events.events || []).map(e => e.id),
    ].filter(Boolean);
    ReadTracker.markAllRead(ids);
    MapView.refreshMarkerStyles && MapView.refreshMarkerStyles();
    App.updateUnreadCount();
    this._print(`Marked ${ids.length} items as read ✓`, 'success');
  },

  async _cmdRefresh(args) {
    const what = args[0] || 'feeds';
    if (what === 'feeds') {
      this._print('Refreshing feeds...', 'info');
      try {
        await fetch('/api/feeds/refresh', { method: 'POST' });
        await Feeds.load();
        this._print('Feeds refreshed ✓', 'success');
      } catch (err) {
        this._print(`Refresh failed: ${this._escape(err.message)}`, 'error');
      }
    } else {
      this._print(`Unknown target: <span class="t-accent">${this._escape(what)}</span>. Try: <span class="t-accent">refresh feeds</span>`, 'error');
    }
  },

  _cmdShortcuts() {
    App.toggleShortcutsOverlay();
    this._print('Keyboard shortcuts overlay opened.', 'success');
  },

  _cmdTheme(name) {
    const THEMES = { green: 'green', amber: 'amber', cyan: 'cyan' };
    if (!name) {
      const current = document.documentElement.getAttribute('data-theme') || 'green';
      this._print(`Current theme: <span class="t-accent">${current}</span>. Options: green, amber, cyan`, 'info');
      return;
    }
    const key = name.toLowerCase();
    if (!THEMES[key]) {
      this._print(`Unknown theme: <span class="t-accent">${this._escape(name)}</span>. Options: green, amber, cyan`, 'error');
      return;
    }
    const root = document.documentElement;
    root.setAttribute('data-theme', key);
    localStorage.setItem('cyberspace-theme', key);
    this._print(`Theme switched to <span class="t-accent">${key}</span> ✓`, 'success');
  },

  _cmdCRT() {
    const on = VisualFX.toggleCRT();
    this._print(`CRT scanlines: <span class="t-accent">${on ? 'ON' : 'OFF'}</span>`, on ? 'success' : 'info');
  },

  _cmdVignette() {
    const on = VisualFX.toggleVignette();
    this._print(`Vignette overlay: <span class="t-accent">${on ? 'ON' : 'OFF'}</span>`, on ? 'success' : 'info');
  },

  _cmdEffects() {
    const matrix = document.body.classList.contains('matrix-active') || document.getElementById('matrix-canvas')?.style.display !== 'none';
    this._print('─── Visual Effects ─────────────────────────', 'info');
    this._print(`  CRT scanlines : <span class="t-accent">${VisualFX.crtEnabled ? 'ON' : 'OFF'}</span>`, 'output');
    this._print(`  Vignette      : <span class="t-accent">${VisualFX.vignetteEnabled ? 'ON' : 'OFF'}</span>`, 'output');
    this._print(`  Matrix rain   : <span class="t-accent">${localStorage.getItem('cyberspace-matrix') !== 'off' ? 'ON' : 'OFF'}</span>`, 'output');
    this._print(`  Theme         : <span class="t-accent">${localStorage.getItem('cyberspace-theme') || 'green'}</span>`, 'output');
    this._print('────────────────────────────────────────────', 'info');
    this._print('Toggle with: <span class="t-accent">crt</span>, <span class="t-accent">vignette</span>, <span class="t-accent">theme &lt;color&gt;</span>', 'info');
  },

  _cmdIntercept(arg) {
    if (typeof Announcement === 'undefined') {
      return this._print('No announcement module loaded.', 'error');
    }
    if (arg === 'reset') {
      try { localStorage.removeItem(Announcement.STORAGE_KEY); } catch (_) {}
      this._print('Announcement seen-log cleared. Reload or run <span class="t-accent">intercept show</span> to re-display.', 'success');
      return;
    }
    if (arg === 'show' || !arg) {
      // Always force-fetch for the currently viewed briefing date
      const activeDate = (typeof Briefing !== 'undefined' && Briefing.getCurrentDate)
        ? Briefing.getCurrentDate()
        : null;
      const url = activeDate
        ? `/api/reports/announcement?date=${encodeURIComponent(activeDate)}`
        : '/api/reports/announcement';
      fetch(url).then(async r => {
        if (!r.ok) {
          const dateLabel = activeDate || 'the latest report';
          this._print(`No intercepted transmission found for ${dateLabel}.`, 'info');
          return;
        }
        const { date, content } = await r.json();
        const { meta, body } = Announcement._parseFrontmatter(content);
        Announcement._date = date;
        Announcement._meta = meta;
        Announcement._body = body;
        // Temporarily remove this date from seen so the overlay can re-open
        const seen = Announcement._getSeen().filter(d => d !== date);
        try { localStorage.setItem(Announcement.STORAGE_KEY, JSON.stringify(seen)); } catch (_) {}
        Announcement._showHeaderIcon();
        Announcement._openOverlay();
        this._print(`Intercepted: <span class="t-accent">${this._escape(meta?.title || date)}</span>`, 'success');
      }).catch(() => {
        this._print('Failed to fetch announcement.', 'error');
      });
      return;
    }
    this._print('Usage: <span class="t-accent">intercept</span> &nbsp;or&nbsp; <span class="t-accent">intercept reset</span>', 'info');
  },

  async _cmdExport() {
    this._print('Gathering data for export…', 'info');
    const result = await DataIO.export();
    if (result.ok) {
      const c = result.counts;
      this._print('Export downloaded ✓', 'success');
      this._print(`  tasks: <span class="t-accent">${c.tasks}</span>  links: <span class="t-accent">${c.links}</span>  bookmarks: <span class="t-accent">${c.bookmarks}</span>  read: <span class="t-accent">${c.readItems}</span>`, 'output');
      this._print(`  events: <span class="t-accent">${c.events}</span>  briefing dates: <span class="t-accent">${c.briefingDates}</span>  projects: <span class="t-accent">${c.projects}</span>`, 'output');
    } else {
      this._print(`Export failed: ${this._escape(result.error)}`, 'error');
    }
  },

  async _cmdImport(mode) {
    this._print(`Opening file picker — import mode: <span class="t-accent">${mode}</span>`, 'info');
    if (mode === 'replace') {
      this._print('⚠ Replace mode: current data will be overwritten.', 'error');
    }
    const result = await DataIO.importFromFile(mode);
    if (result.cancelled) {
      this._print('Import cancelled.', 'info');
      return;
    }
    if (!result.ok) {
      this._print(`Import failed: ${this._escape(result.error || 'unknown error')}`, 'error');
      return;
    }
    const c = result.counts;
    this._print(`Import complete (${result.mode}) ✓`, 'success');
    this._print(`  tasks: <span class="t-accent">${c.tasks}</span>  links: <span class="t-accent">${c.links}</span>  bookmarks: <span class="t-accent">${c.bookmarks}</span>  read: <span class="t-accent">${c.readItems}</span>`, 'output');
    this._print(`  events: <span class="t-accent">${c.events}</span>  briefing dates: <span class="t-accent">${c.briefingDates}</span>  projects: <span class="t-accent">${c.projects}</span>`, 'output');
    if (result.serverResult && !result.serverResult.ok) {
      this._print(`Server import warning: ${this._escape(result.serverResult.error || '')}`, 'error');
    }
  },

  _cmdHelp(sub) {
    const HELP = {
      events:    'events [--priority|--date|--cost]   Open events panel with optional sort',
      feeds:     'feeds [--critical|--category <n>]   Open feeds panel with optional filter',
      briefing:  'briefing [YYYY-MM-DD]               Open briefing (date optional)',
      map:       'map                                  Close panels, focus map',
      config:    'config [interests|news|events|rss|feedback]  Open settings config tab',
      status:    'status                               System status summary',
      threat:    'threat                               Current threat level',
      unread:    'unread                               Unread counts by source',
      search:    'search <query>                       Search briefing + feeds + events',
      feedback:  'feedback <text>                      Append to feedback.md',
      'mark-read':'mark-read                           Mark all visible items as read',
      refresh:   'refresh [feeds]                      Force re-fetch feeds',
      intercept: 'intercept [reset]                    Show intercepted transmission / reset seen',      export:    'export                               Download backup of all data to JSON file',
      import:    'import [--replace]                   Import data from backup file (merge by default)',      clear:     'clear                                Clear terminal output',
      shortcuts: 'shortcuts                            Open keyboard shortcuts overlay',
      theme:     'theme <green|amber|cyan>             Switch accent color',
      crt:       'crt                                  Toggle CRT scanline overlay',
      vignette:  'vignette                             Toggle vignette overlay',
      effects:   'effects                              Show all visual effect states',
      help:      'help [command]                       Show this help',
    };

    if (sub && HELP[sub]) {
      this._print(HELP[sub], 'info');
    } else {
      this._print('─── cyberspace terminal commands ───────────', 'info');
      this._print('<span class="t-dim">NAVIGATION</span>', 'info');
      ['events', 'feeds', 'briefing', 'map'].forEach(c => this._print(`  ${HELP[c]}`, 'output'));
      this._print('<span class="t-dim">CONFIGURATION</span>', 'info');
      ['config'].forEach(c => this._print(`  ${HELP[c]}`, 'output'));
      this._print('<span class="t-dim">INFORMATION</span>', 'info');
      ['status', 'threat', 'unread', 'search'].forEach(c => this._print(`  ${HELP[c]}`, 'output'));
      this._print('<span class="t-dim">ACTIONS</span>', 'info');
      ['feedback', 'mark-read', 'refresh', 'intercept', 'export', 'import', 'theme', 'shortcuts', 'clear', 'help'].forEach(c => this._print(`  ${HELP[c]}`, 'output'));
      this._print('<span class="t-dim">VISUAL</span>', 'info');
      ['crt', 'vignette', 'effects'].forEach(c => this._print(`  ${HELP[c]}`, 'output'));
      this._print('────────────────────────────────────────────', 'info');
      this._print('Tab to complete · ↑↓ history · T to toggle', 'info');
    }
  },
};
