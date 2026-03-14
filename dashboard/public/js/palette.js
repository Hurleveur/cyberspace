/**
 * Palette — Ctrl+K command palette. Searches across feeds, briefing headings, and events.
 */
const Palette = {
  visible: false,
  results: [],
  activeIndex: -1,
  _headingEls: [],
  _history: [],
  _historyIndex: -1,
  _HISTORY_KEY: 'cyberspace-cmd-history',

  init() {
    this._injectModal();
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.visible ? this.close() : this.open();
      }
    });
  },

  _injectModal() {
    const el = document.createElement('div');
    el.id = 'palette-overlay';
    el.className = 'palette-overlay hidden';
    el.innerHTML = `
      <div class="palette-box">
        <div class="palette-input-row">
          <input id="palette-input" type="text" placeholder="Search feeds, briefing, events… or > command" autocomplete="off" spellcheck="false"/>
          <span class="palette-esc-hint">esc</span>
        </div>
        <div id="palette-results" class="palette-results"></div>
      </div>
    `;
    document.body.appendChild(el);

    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });

    const input = document.getElementById('palette-input');
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      this._historyIndex = -1; // reset history cursor on manual input
      timer = setTimeout(() => this.search(input.value), 100);
    });
    input.addEventListener('keydown', (e) => {
      const inCmdMode = input.value.trimStart().startsWith('>');
      if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
      if (e.key === 'Tab' && inCmdMode) { e.preventDefault(); this._tabComplete(input); return; }
      if (e.key === 'ArrowUp' && inCmdMode) { e.preventDefault(); this._historyNav(1, input); return; }
      if (e.key === 'ArrowDown' && inCmdMode) { e.preventDefault(); this._historyNav(-1, input); return; }
      if (e.key === 'ArrowDown' && !inCmdMode) { e.preventDefault(); this.navigate(1); }
      if (e.key === 'ArrowUp' && !inCmdMode) { e.preventDefault(); this.navigate(-1); }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (inCmdMode) this._saveHistory(input.value);
        this.executeActive();
      }
    });
  },

  open() {
    this.visible = true;
    this._historyIndex = -1;
    this._loadHistory();
    document.getElementById('palette-overlay').classList.remove('hidden');
    const input = document.getElementById('palette-input');
    input.value = '';
    input.focus();
    this.search('');
  },

  /** Open palette pre-loaded in command mode (> prefix). */
  openCommandMode() {
    this.visible = true;
    this._historyIndex = -1;
    this._loadHistory();
    document.getElementById('palette-overlay').classList.remove('hidden');
    const input = document.getElementById('palette-input');
    input.value = '> ';
    input.focus();
    input.setSelectionRange(2, 2);
    this.searchCommands('');
  },

  close() {
    this.visible = false;
    document.getElementById('palette-overlay').classList.add('hidden');
    this.activeIndex = -1;
  },

  search(query) {
    const q = query.toLowerCase().trim();

    // ── Command mode: query starts with '>' ──
    if (query.trimStart().startsWith('>')) {
      this.searchCommands(query.trimStart().slice(1).trim());
      return;
    }

    const groups = [];

    // ── Feeds ──
    if (typeof Feeds !== 'undefined' && Feeds.items) {
      const feedResults = Feeds.items
        .filter(item => !q ||
          item.title.toLowerCase().includes(q) ||
          item.source.toLowerCase().includes(q))
        .slice(0, 6)
        .map(item => ({ type: 'feed', id: item.id, title: item.title, meta: item.source }));
      if (feedResults.length > 0) groups.push({ label: 'FEEDS', items: feedResults });
    }

    // ── Briefing headings ──
    this._headingEls = [];
    const headings = document.querySelectorAll('#briefing-content .markdown-body h2, #briefing-content .markdown-body h3');
    const headingResults = [];
    for (const h of headings) {
      const text = h.textContent.replace(/[🔴🟠🟡🟢]/gu, '').trim();
      if (!q || text.toLowerCase().includes(q)) {
        const idx = this._headingEls.length;
        this._headingEls.push(h);
        headingResults.push({ type: 'heading', id: String(idx), title: text, meta: 'Briefing' });
        if (headingResults.length >= 6) break;
      }
    }
    if (headingResults.length > 0) groups.push({ label: 'BRIEFING', items: headingResults });

    // ── Events ──
    if (typeof Events !== 'undefined' && Events.events) {
      const eventResults = Events.events
        .filter(ev => !q ||
          ev.name.toLowerCase().includes(q) ||
          (ev.where || '').toLowerCase().includes(q))
        .slice(0, 5)
        .map(ev => ({ type: 'event', id: ev.id, title: ev.name, meta: ev.when || ev.where || '' }));
      if (eventResults.length > 0) groups.push({ label: 'EVENTS', items: eventResults });
    }

    this.render(groups);
  },

  render(groups) {
    const container = document.getElementById('palette-results');
    this.results = [];

    if (groups.length === 0) {
      container.innerHTML = '<div style="padding:12px 14px;color:#444;font-size:12px;">No results</div>';
      return;
    }

    let html = '';
    for (const group of groups) {
      html += `<div class="palette-group-label">${group.label}</div>`;
      for (const item of group.items) {
        const idx = this.results.length;
        this.results.push(item);
        const icon = item.type === 'feed' ? '📡' : item.type === 'heading' ? '📋' : '📅';
        html += `<div class="palette-result" data-idx="${idx}" data-type="${item.type}" data-id="${this._esc(item.id)}">
          <span class="palette-result-icon">${icon}</span>
          <span class="palette-result-title">${this._esc(item.title)}</span>
          <span class="palette-result-meta">${this._esc(item.meta)}</span>
        </div>`;
      }
    }

    container.innerHTML = html;

    container.querySelectorAll('.palette-result').forEach(el => {
      el.addEventListener('click', () => this.execute(el));
      el.addEventListener('mouseenter', () => {
        container.querySelectorAll('.palette-result').forEach(r => r.classList.remove('palette-active'));
        el.classList.add('palette-active');
        this.activeIndex = parseInt(el.dataset.idx);
      });
    });

    this.activeIndex = this.results.length > 0 ? 0 : -1;
    this._updateActive();
  },

  navigate(dir) {
    if (this.results.length === 0) return;
    this.activeIndex = (this.activeIndex + dir + this.results.length) % this.results.length;
    this._updateActive();
    const active = document.querySelector('#palette-results .palette-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  },

  _updateActive() {
    const els = document.querySelectorAll('#palette-results .palette-result');
    els.forEach((el, i) => el.classList.toggle('palette-active', i === this.activeIndex));
  },

  executeActive() {
    const el = document.querySelector('#palette-results .palette-result.palette-active');
    if (el) this.execute(el);
  },

  execute(el) {
    const type = el.dataset.type;
    const id = el.dataset.id;

    if (type === 'command') {
      // Run first, then close — keeps same order as the click handler
      this._runPaletteCommand(el.dataset.id, el.dataset.cmdargs || '');
      this.close();
      return;
    }

    this.close();

    if (type === 'feed') {
      App.showPanel('left');
      App.switchLeftTab('feeds');
      setTimeout(() => Feeds.scrollToItem(id), 150);
    } else if (type === 'heading') {
      App.showPanel('left');
      App.switchLeftTab('briefing');
      const h = this._headingEls[parseInt(id)];
      if (h) {
        setTimeout(() => {
          const section = h.nextElementSibling;
          if (section?.classList.contains('briefing-section') && !section.classList.contains('expanded')) {
            section.classList.add('expanded');
            if (h.tagName === 'H2') h.classList.add('expanded');
          }
          h.scrollIntoView({ behavior: 'smooth', block: 'center' });
          h.classList.add('highlight-flash');
          setTimeout(() => h.classList.remove('highlight-flash'), 1500);
        }, 150);
      }
    } else if (type === 'event') {
      App.showPanel('right');
      setTimeout(() => Events.scrollToEvent(id), 150);
    }
  },

  // ── Command Mode ──

  _commands: [
    { id: 'theme',        label: 'theme <green|amber|cyan>',  icon: '🎨', desc: 'Switch accent colour scheme' },
    { id: 'status',       label: 'status',                    icon: '📊', desc: 'Show system status summary' },
    { id: 'threat',       label: 'threat',                    icon: '🔴', desc: 'Show current threat level' },
    { id: 'feedback',     label: 'feedback <text>',           icon: '💬', desc: 'Append text to config/feedback.md' },
    { id: 'mark-read',    label: 'mark-read',                 icon: '✓',  desc: 'Mark all current items as read' },
    { id: 'refresh',      label: 'refresh feeds',             icon: '↻',  desc: 'Force re-fetch all RSS feeds' },
    { id: 'unread',       label: 'unread',                    icon: '🔔', desc: 'Show unread counts by source' },
    { id: 'crt',          label: 'crt',                       icon: '📺', desc: 'Toggle CRT scanline overlay' },
    { id: 'vignette',     label: 'vignette',                  icon: '🔲', desc: 'Toggle vignette overlay' },
    { id: 'effects',      label: 'effects',                   icon: '✨', desc: 'Show visual effect states' },
  ],

  searchCommands(query) {
    const container = document.getElementById('palette-results');
    this.results = [];

    const q = query.toLowerCase();
    const hint = `<div class="palette-cmd-hint">⌘ Command mode &nbsp;<code>&gt; command [args]</code></div>`;

    // Detect inline args — e.g. "theme cyan" → id=theme, args=cyan
    let matchId = null, matchArgs = '';
    for (const cmd of this._commands) {
      const baseId = cmd.id;
      if (q === baseId || q.startsWith(baseId + ' ')) {
        matchId = baseId;
        matchArgs = q.slice(baseId.length).trim();
        break;
      }
    }

    // If exact match with args: show single runnable entry
    if (matchId && matchArgs) {
      const cmd = this._commands.find(c => c.id === matchId);
      this.results = [{ type: 'command', id: matchId, title: `${cmd.id} ${matchArgs}`, meta: cmd.desc }];
      container.innerHTML = hint + `<div class="palette-result palette-active" data-idx="0" data-type="command" data-id="${matchId}" data-cmdargs="${this._esc(matchArgs)}">
        <span class="palette-result-icon">${cmd.icon}</span>
        <span class="palette-result-title">${this._esc(cmd.id)} <span style="color:var(--accent)">${this._esc(matchArgs)}</span></span>
        <span class="palette-result-meta">Press Enter to run</span>
      </div>`;
      this.activeIndex = 0;
      this._bindCommandRows(container);
      return;
    }

    // Otherwise filter & list commands
    const filtered = this._commands.filter(cmd =>
      !q || cmd.id.includes(q) || cmd.desc.toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
      container.innerHTML = hint + `<div class="palette-cmd-output">Unknown command. Available: ${this._commands.map(c => c.id).join(', ')}</div>`;
      this.activeIndex = -1;
      return;
    }

    let html = hint;
    for (const cmd of filtered) {
      const idx = this.results.length;
      this.results.push({ type: 'command', id: cmd.id, title: cmd.label });
      html += `<div class="palette-result" data-idx="${idx}" data-type="command" data-id="${cmd.id}" data-cmdargs="">
        <span class="palette-result-icon">${cmd.icon}</span>
        <span class="palette-result-title">${this._esc(cmd.label)}</span>
        <span class="palette-result-meta">${this._esc(cmd.desc)}</span>
      </div>`;
    }
    container.innerHTML = html;
    this.activeIndex = filtered.length > 0 ? 0 : -1;
    this._updateActive();
    this._bindCommandRows(container);
  },

  _bindCommandRows(container) {
    container.querySelectorAll('.palette-result').forEach(el => {
      el.addEventListener('click', () => {
        this._runPaletteCommand(el.dataset.id, el.dataset.cmdargs || '');
        this.close();
      });
      el.addEventListener('mouseenter', () => {
        container.querySelectorAll('.palette-result').forEach(r => r.classList.remove('palette-active'));
        el.classList.add('palette-active');
        this.activeIndex = parseInt(el.dataset.idx);
      });
    });
  },

  _runPaletteCommand(id, args) {
    const container = document.getElementById('palette-results');

    if (id === 'theme') {
      const color = args || 'green';
      if (!['green', 'amber', 'cyan'].includes(color)) {
        container.innerHTML = `<div class="palette-cmd-hint">⌘ Command mode</div><div class="palette-cmd-output">Usage: theme &lt;green|amber|cyan&gt;</div>`;
        return;
      }
      Settings.applyTheme(color);
      App.toast(`Theme switched to ${color}`, 'briefing');
      return;
    }

    if (id === 'mark-read') {
      const ids = (MapView.markers || []).map(m => m.data?.id).filter(Boolean);
      if (ids.length) ReadTracker.markAllRead(ids);
      App.updateUnreadCount();
      App.toast(`Marked ${ids.length} items as read`, 'briefing');
      return;
    }

    if (id === 'refresh') {
      Feeds.load();
      App.toast('Refreshing feeds…', 'feeds');
      return;
    }

    if (id === 'feedback') {
      if (!args) {
        container.innerHTML = `<div class="palette-cmd-hint">⌘ Command mode</div><div class="palette-cmd-output">Usage: feedback &lt;text&gt;\nType your feedback after the command.</div>`;
        return;
      }
      fetch('/api/file?path=config/feedback.md')
        .then(r => r.ok ? r.text() : '')
        .then(existing => fetch('/api/file?path=config/feedback.md', {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          body: existing + '\n- ' + args + '\n',
        }))
        .then(() => App.toast('Feedback saved', 'briefing'))
        .catch(() => App.toast('Could not save feedback', 'briefing'));
      return;
    }

    if (id === 'status') {
      const lastBriefing = (typeof Briefing !== 'undefined' && Briefing.dates[0]) || '—';
      const feedCount = (typeof Feeds !== 'undefined' && Feeds.items) ? Feeds.items.length : '—';
      const unreadMarkers = (MapView.markers || []).filter(m => m.data?.id && !ReadTracker.isRead(m.data.id)).length;
      const theme = localStorage.getItem('cyberspace-theme') || 'green';
      const streak = (() => {
        const m = document.querySelector('#briefing-content .markdown-body')?.textContent?.match(/Briefing #(\d+)/);
        return m ? `#${m[1]}` : '—';
      })();
      const output = [
        `Last briefing : ${lastBriefing}`,
        `Streak        : ${streak}`,
        `Feed items    : ${feedCount}`,
        `Unread markers: ${unreadMarkers}`,
        `Active theme  : ${theme}`,
        `Active date   : ${App.activeDate || '—'}`,
      ].join('\n');
      container.innerHTML = `<div class="palette-cmd-hint">⌘ status</div><div class="palette-cmd-output">${this._esc(output)}</div>`;
      this.results = [];
      this.activeIndex = -1;
      return;
    }

    if (id === 'threat') {
      const el = document.querySelector('#briefing-content .markdown-body');
      const text = el ? el.textContent : '';
      const match = text.match(/Overall threat level[:\s]*(🟢|🟡|🟠|🔴)\s*([A-Z]+)/i);
      const level = match ? `${match[1]} ${match[2]}` : 'Not available';
      container.innerHTML = `<div class="palette-cmd-hint">⌘ threat</div><div class="palette-cmd-output">Current threat level: ${this._esc(level)}\nDate: ${App.activeDate || '—'}</div>`;
      this.results = [];
      this.activeIndex = -1;
      return;
    }

    if (id === 'unread') {
      const feedUnread = typeof Feeds !== 'undefined' && Feeds.getUnreadCount ? Feeds.getUnreadCount() : 0;
      const markerUnread = (MapView.markers || []).filter(m => m.data?.id && !ReadTracker.isRead(m.data.id)).length;
      const lines = [`Unread feed items : ${feedUnread}`, `Unread map markers: ${markerUnread}`];
      // Per-category breakdown
      const byCat = {};
      for (const m of (MapView.markers || [])) {
        const d = m.data;
        if (d?.id && !ReadTracker.isRead(d.id)) {
          const cat = d.category || 'other';
          byCat[cat] = (byCat[cat] || 0) + 1;
        }
      }
      for (const [cat, cnt] of Object.entries(byCat)) {
        lines.push(`  ${cat.padEnd(18)}: ${cnt}`);
      }
      container.innerHTML = `<div class="palette-cmd-hint">⌘ unread</div><div class="palette-cmd-output">${this._esc(lines.join('\n'))}</div>`;
      this.results = [];
      this.activeIndex = -1;
      return;
    }

    if (id === 'crt') {
      const on = VisualFX.toggleCRT();
      App.toast(`CRT scanlines ${on ? 'ON' : 'OFF'}`, 'briefing');
      return;
    }

    if (id === 'vignette') {
      const on = VisualFX.toggleVignette();
      App.toast(`Vignette ${on ? 'ON' : 'OFF'}`, 'briefing');
      return;
    }

    if (id === 'effects') {
      const crt = VisualFX.crtEnabled ? 'ON' : 'OFF';
      const vig = VisualFX.vignetteEnabled ? 'ON' : 'OFF';
      const matrix = localStorage.getItem('cyberspace-matrix') !== 'off' ? 'ON' : 'OFF';
      const theme = localStorage.getItem('cyberspace-theme') || 'green';
      const lines = [`CRT scanlines : ${crt}`, `Vignette      : ${vig}`, `Matrix rain   : ${matrix}`, `Theme         : ${theme}`];
      container.innerHTML = `<div class="palette-cmd-hint">⌘ effects</div><div class="palette-cmd-output">${this._esc(lines.join('\n'))}</div>`;
      this.results = [];
      this.activeIndex = -1;
      return;
    }
  },

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  },

  // ── History & Tab Complete ──

  _loadHistory() {
    try { this._history = JSON.parse(localStorage.getItem(this._HISTORY_KEY) || '[]'); }
    catch { this._history = []; }
  },

  _saveHistory(query) {
    if (!query.trim() || query.trim() === '>') return;
    this._loadHistory();
    this._history = [query, ...this._history.filter(h => h !== query)].slice(0, 50);
    localStorage.setItem(this._HISTORY_KEY, JSON.stringify(this._history));
  },

  _historyNav(dir, input) {
    const cmdHistory = this._history.filter(h => h.trimStart().startsWith('>'));
    if (cmdHistory.length === 0) return;
    this._historyIndex = Math.max(-1, Math.min(cmdHistory.length - 1, this._historyIndex + dir));
    if (this._historyIndex >= 0) {
      input.value = cmdHistory[this._historyIndex];
      this.search(input.value);
      // Move cursor to end
      input.setSelectionRange(input.value.length, input.value.length);
    }
  },

  _tabComplete(input) {
    const after = input.value.trimStart().slice(1).trim().toLowerCase();
    if (!after) return; // already showing full list
    const matches = this._commands.filter(c => c.id.startsWith(after));
    if (matches.length === 0) return;
    if (matches.length === 1) {
      input.value = '> ' + matches[0].id + ' ';
    } else {
      // Complete to the longest common prefix
      let prefix = matches[0].id;
      for (const cmd of matches.slice(1)) {
        let i = 0;
        while (i < prefix.length && prefix[i] === cmd.id[i]) i++;
        prefix = prefix.slice(0, i);
      }
      if (prefix.length > after.length) input.value = '> ' + prefix;
    }
    this.search(input.value);
    input.setSelectionRange(input.value.length, input.value.length);
  },
};
