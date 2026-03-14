/**
 * Settings panel — renders config files as formatted markdown.
 * Pencil icon toggles raw textarea editing.
 */
const Settings = {
  currentFile: 'config/interests.md',
  editing: false,
  PROJECTS_KANBAN_KEY: 'cyberspace-projects-kanban-enabled',

  init() {
    this.loadTheme();
    this.bindEvents();
  },

  bindEvents() {
    const overlay = document.getElementById('settings-overlay');

    // Tab switching
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentFile = tab.dataset.config;
        this.editing = false;
        this.showView();
        this.loadFile();
      });
    });

    // Export / Import buttons
    document.getElementById('settings-export-btn').addEventListener('click', async () => {
      const result = await DataIO.export();
      if (result.ok) {
        const c = result.counts;
        App.toast(`Backup downloaded — ${c.tasks} tasks, ${c.links} links, ${c.readItems} read items, ${c.projects} projects`, 'success');
      } else {
        App.toast(`Export failed: ${result.error}`, 'error');
      }
    });

    document.getElementById('settings-import-btn').addEventListener('click', async () => {
      const result = await DataIO.importFromFile('merge');
      if (result.cancelled) return;
      if (result.ok) {
        const c = result.counts;
        App.toast(`Imported — ${c.tasks} tasks, ${c.links} links, ${c.projects} projects`, 'success');
      } else {
        App.toast(`Import failed: ${result.error}`, 'error');
      }
    });

    // Edit toggle
    document.getElementById('settings-edit-btn').addEventListener('click', () => {
      this.editing = !this.editing;
      if (this.editing) {
        this.showEditor();
      } else {
        this.showView();
      }
    });

    // Save
    document.getElementById('settings-save').addEventListener('click', () => this.save());

    // Cancel
    document.getElementById('settings-cancel').addEventListener('click', () => {
      this.editing = false;
      this.showView();
    });

    // Close
    document.getElementById('settings-close').addEventListener('click', () => {
      document.getElementById('settings-overlay').classList.add('hidden');
    });

    // Click outside content closes overlay unless currently editing
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !this.editing) {
        this.close();
      }
    });
  },

  open() {
    document.getElementById('settings-overlay').classList.remove('hidden');
    this.editing = false;
    this.showView();
    this.loadFile();
  },

  close() {
    document.getElementById('settings-overlay').classList.add('hidden');
  },

  async loadFile() {
    const view = document.getElementById('settings-view');
    view.innerHTML = '<div class="empty-state">Loading...</div>';

    // System tab gets a custom UI
    if (this.currentFile === '__system') {
      this.loadSystemTab();
      return;
    }

    // RSS feeds get a visual manager unless raw editing is active
    if (this.currentFile === 'config/rss.md' && !this.editing) {
      await this.loadRssVisual();
      return;
    }

    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(this.currentFile)}`);
      if (!res.ok) throw new Error('File not found');
      const content = await res.text();

      // Render as markdown
      view.innerHTML = `<div class="markdown-body">${marked.parse(content)}</div>`;
      // Open all links in new tab
      view.querySelectorAll('.markdown-body a[href]').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });

      // Store raw content for editor
      view.dataset.raw = content;
    } catch (err) {
      view.innerHTML = `<div class="empty-state">Could not load ${this.currentFile}: ${err.message}</div>`;
    }
  },

  // ── RSS Visual Manager ──

  parseRssMd(content) {
    const feeds = [];
    let currentCategory = 'Uncategorized';
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      const headingMatch = trimmed.match(/^##\s+(.+)/);
      if (headingMatch) { currentCategory = headingMatch[1].trim(); continue; }
      const feedMatch = trimmed.match(/^-\s+(https?:\/\/\S+)(?:\s+\[(\w+)\])?/);
      if (feedMatch) {
        feeds.push({
          url: feedMatch[1],
          category: currentCategory,
          priority: (feedMatch[2] || 'MEDIUM').toUpperCase(),
        });
      }
    }
    return feeds;
  },

  async loadRssVisual() {
    const view = document.getElementById('settings-view');
    try {
      const res = await fetch('/api/file?path=config/rss.md');
      if (!res.ok) throw new Error('config/rss.md not found');
      const content = await res.text();
      view.dataset.raw = content;
      const feeds = this.parseRssMd(content);
      this.renderRssVisual(feeds);
    } catch (err) {
      view.innerHTML = `<div class="empty-state">Could not load config/rss.md: ${err.message}</div>`;
    }
  },

  renderRssVisual(feeds) {
    const view = document.getElementById('settings-view');

    // Collect existing categories for datalist
    const categories = [...new Set(feeds.map(f => f.category))];
    const catOptions = categories.map(c => `<option value="${this._esc(c)}">`).join('');

    // Group by category
    const byCategory = new Map();
    for (const f of feeds) {
      if (!byCategory.has(f.category)) byCategory.set(f.category, []);
      byCategory.get(f.category).push(f);
    }

    let html = `<div class="rss-manager">
      <div class="rss-add-form">
        <div class="rss-add-title">Add Feed</div>
        <input id="rss-url-input" type="url" placeholder="https://example.com/feed.xml" autocomplete="off"/>
        <div class="rss-add-row">
          <input id="rss-category-input" type="text" placeholder="Category" list="rss-cat-list" autocomplete="off"/>
          <datalist id="rss-cat-list">${catOptions}</datalist>
          <select id="rss-priority-select">
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM" selected>MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
          <button id="rss-test-new-btn">Test</button>
          <button id="rss-add-btn" class="rss-primary">Add</button>
        </div>
        <div id="rss-add-status" class="rss-add-status"></div>
      </div>`;

    if (byCategory.size === 0) {
      html += `<div class="rss-empty">No feeds configured yet.</div>`;
    } else {
      for (const [cat, items] of byCategory) {
        html += `<div class="rss-category-header">${this._esc(cat)} (${items.length})</div>`;
        for (const feed of items) {
          const eu = this._esc(feed.url);
          const uid = this._urlId(feed.url);
          html += `<div class="rss-feed-card" data-url="${eu}">
            <div class="rss-feed-main">
              <div class="rss-feed-url" title="${eu}">${eu}</div>
              <div class="rss-feed-actions">
                <span class="rss-priority-badge ${feed.priority}">${feed.priority}</span>
                <button class="rss-test-btn" data-url="${eu}">Test</button>
                <button class="rss-edit-btn" data-url="${eu}">Edit</button>
                <button class="rss-remove-btn" data-url="${eu}" title="Remove feed">✕</button>
                <span class="rss-test-result" id="result-${uid}"></span>
              </div>
            </div>
            <div class="rss-feed-edit hidden">
              <input class="rss-edit-url" type="url" value="${eu}" autocomplete="off"/>
              <div class="rss-edit-row">
                <select class="rss-edit-priority">
                  <option value="HIGH" ${feed.priority === 'HIGH' ? 'selected' : ''}>HIGH</option>
                  <option value="MEDIUM" ${feed.priority === 'MEDIUM' ? 'selected' : ''}>MEDIUM</option>
                  <option value="LOW" ${feed.priority === 'LOW' ? 'selected' : ''}>LOW</option>
                </select>
                <button class="rss-edit-save" data-url="${eu}">Save</button>
                <button class="rss-edit-cancel">Cancel</button>
              </div>
            </div>
          </div>`;
        }
      }
    }

    html += `</div>`;
    view.innerHTML = html;

    // ── Bind events ──

    document.getElementById('rss-add-btn').addEventListener('click', () => {
      const url = document.getElementById('rss-url-input').value.trim();
      const category = document.getElementById('rss-category-input').value.trim() || 'Uncategorized';
      const priority = document.getElementById('rss-priority-select').value;
      if (!url || !/^https?:\/\//i.test(url)) {
        const status = document.getElementById('rss-add-status');
        status.textContent = 'Invalid URL';
        status.className = 'rss-add-status rss-status-err';
        return;
      }
      this.addFeed(url, category, priority);
    });

    document.getElementById('rss-test-new-btn').addEventListener('click', () => {
      const url = document.getElementById('rss-url-input').value.trim();
      const statusEl = document.getElementById('rss-add-status');
      this.testFeed(url, statusEl);
    });

    view.querySelectorAll('.rss-test-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        const resultEl = document.getElementById(`result-${this._urlId(url)}`);
        this.testFeed(url, resultEl);
      });
    });

    view.querySelectorAll('.rss-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => this.removeFeed(btn.dataset.url));
    });

    view.querySelectorAll('.rss-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.rss-feed-card');
        card.querySelector('.rss-feed-main').classList.add('hidden');
        card.querySelector('.rss-feed-edit').classList.remove('hidden');
        card.querySelector('.rss-edit-url').focus();
      });
    });

    view.querySelectorAll('.rss-edit-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.rss-feed-card');
        card.querySelector('.rss-feed-edit').classList.add('hidden');
        card.querySelector('.rss-feed-main').classList.remove('hidden');
      });
    });

    view.querySelectorAll('.rss-edit-save').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.rss-feed-card');
        const oldUrl = btn.dataset.url;
        const newUrl = card.querySelector('.rss-edit-url').value.trim();
        const newPriority = card.querySelector('.rss-edit-priority').value;
        if (!newUrl || !/^https?:\/\//i.test(newUrl)) return;
        this.editFeed(oldUrl, newUrl, newPriority);
      });
    });
  },

  async editFeed(oldUrl, newUrl, newPriority) {
    try {
      const res = await fetch('/api/file?path=config/rss.md');
      if (!res.ok) throw new Error('Could not read config/rss.md');
      const content = await res.text();

      let replaced = false;
      const updated = content.split('\n').map(line => {
        if (!replaced && line.includes(oldUrl) && /^\s*-\s+https?:\/\//.test(line)) {
          replaced = true;
          return `- ${newUrl} [${newPriority}]`;
        }
        return line;
      });

      if (!replaced) throw new Error('Feed not found');

      await fetch('/api/file?path=config/rss.md', {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: updated.join('\n'),
      });

      await this.loadRssVisual();
    } catch (err) {
      console.error('[settings] editFeed error:', err);
    }
  },

  async testFeed(url, statusEl) {
    if (!url || !/^https?:\/\//i.test(url)) {
      if (statusEl) { statusEl.textContent = 'Invalid URL'; statusEl.className = 'rss-test-result rss-status-err'; }
      return;
    }
    if (statusEl) { statusEl.textContent = 'Testing…'; statusEl.className = 'rss-test-result'; }
    try {
      const res = await fetch(`/api/feeds/test?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.ok) {
        const msg = `✓ ${data.feedTitle || 'OK'} · ${data.count} item${data.count !== 1 ? 's' : ''}`;
        if (statusEl) { statusEl.textContent = msg; statusEl.className = 'rss-test-result rss-status-ok'; }
      } else {
        if (statusEl) { statusEl.textContent = `✗ ${data.error}`; statusEl.className = 'rss-test-result rss-status-err'; }
      }
    } catch (err) {
      if (statusEl) { statusEl.textContent = `✗ ${err.message}`; statusEl.className = 'rss-test-result rss-status-err'; }
    }
  },

  async addFeed(url, category, priority) {
    const statusEl = document.getElementById('rss-add-status');
    try {
      const res = await fetch('/api/file?path=config/rss.md');
      if (!res.ok) throw new Error('Could not read config/rss.md');
      const content = await res.text();
      const lines = content.split('\n');

      const catHeader = `## ${category}`;
      const catIdx = lines.findIndex(l => l.trim() === catHeader);

      if (catIdx !== -1) {
        let insertAt = catIdx + 1;
        for (let i = catIdx + 1; i < lines.length; i++) {
          const l = lines[i].trim();
          if (l.startsWith('##')) break;
          if (l.startsWith('- http')) insertAt = i + 1;
        }
        lines.splice(insertAt, 0, `- ${url} [${priority}]`);
      } else {
        lines.push('', `## ${category}`, `- ${url} [${priority}]`, '');
      }

      await fetch('/api/file?path=config/rss.md', {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: lines.join('\n'),
      });

      if (statusEl) { statusEl.textContent = 'Feed added.'; statusEl.className = 'rss-add-status rss-status-ok'; }
      await this.loadRssVisual();
    } catch (err) {
      if (statusEl) { statusEl.textContent = `Error: ${err.message}`; statusEl.className = 'rss-add-status rss-status-err'; }
    }
  },

  async removeFeed(url) {
    try {
      const res = await fetch('/api/file?path=config/rss.md');
      if (!res.ok) throw new Error('Could not read config/rss.md');
      const content = await res.text();
      const lines = content.split('\n');

      // Remove the line that references this URL
      const filtered = lines.filter(l => !l.includes(url));

      // Prune now-empty category headers
      const cleaned = [];
      for (let i = 0; i < filtered.length; i++) {
        const l = filtered[i];
        if (/^##\s/.test(l)) {
          let hasFeeds = false;
          for (let j = i + 1; j < filtered.length; j++) {
            const next = filtered[j].trim();
            if (next.startsWith('##')) break;
            if (next.startsWith('- http')) { hasFeeds = true; break; }
          }
          if (hasFeeds) cleaned.push(l);
        } else {
          cleaned.push(l);
        }
      }

      await fetch('/api/file?path=config/rss.md', {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: cleaned.join('\n'),
      });

      await this.loadRssVisual();
    } catch (err) {
      console.error('[settings] removeFeed error:', err);
    }
  },

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  },

  _urlId(url) {
    return url.replace(/[^a-z0-9]/gi, '_').slice(-30);
  },

  // ── System Tab ──

  isProjectsKanbanEnabled() {
    return localStorage.getItem(this.PROJECTS_KANBAN_KEY) !== 'off';
  },

  setProjectsKanbanEnabled(enabled) {
    localStorage.setItem(this.PROJECTS_KANBAN_KEY, enabled ? 'on' : 'off');
  },

  loadSystemTab() {
    const view = document.getElementById('settings-view');
    const current = localStorage.getItem('cyberspace-theme') || 'green';

    const themes = [
      { id: 'green', label: 'Green', color: '#00ff41', desc: 'Matrix green (default)' },
      { id: 'amber', label: 'Amber', color: '#ffb300', desc: 'Orange amber terminal' },
      { id: 'cyan',  label: 'Cyan',  color: '#00d4aa', desc: 'Cool teal/cyan' },
    ];

    const lastBriefing = (typeof Briefing !== 'undefined' && Briefing.dates[0]) || '—';
    const feedCount = (typeof Feeds !== 'undefined' && Feeds.items) ? Feeds.items.length : '—';
    const streak = (() => {
      const m = document.querySelector('#briefing-content .markdown-body')?.textContent?.match(/Briefing #(\d+)/);
      return m ? m[1] : '—';
    })();

    const matrixEnabled = localStorage.getItem('cyberspace-matrix') !== 'off';
    const feedInterval = parseInt(localStorage.getItem('cyberspace-feed-interval') || '15');
    const levelingEnabled = typeof LevelSystem !== 'undefined' ? LevelSystem.isEnabled() : false;
    const projectsKanbanEnabled = this.isProjectsKanbanEnabled();
    const levelingInfo = (() => {
      if (!levelingEnabled || typeof LevelSystem === 'undefined') return '';
      const xp = LevelSystem.getXP();
      const { level, xpInLevel, xpNeeded } = LevelSystem.getLevelProgress(xp);
      const title = LevelSystem.getTitle(level);
      const desc  = LevelSystem.getDescription(level);
      return `<div class="system-hint" style="margin-top:4px">Level ${level} &mdash; ${title} &middot; ${xpInLevel}/${xpNeeded} XP (${xp} total)<br><span style="opacity:0.6;font-style:italic">${desc}</span></div>`;
    })();

    const swatches = themes.map(t => `
      <button class="theme-swatch${t.id === current ? ' active' : ''}" data-theme="${t.id}" title="${t.desc}">
        <span class="theme-swatch-dot" style="background:${t.color}"></span>
        <span class="theme-swatch-label">${t.label}</span>
        ${t.id === current ? '<span class="theme-swatch-check">✓</span>' : ''}
      </button>`).join('');

    const crtEnabled = typeof VisualFX !== 'undefined' ? VisualFX.crtEnabled : true;
    const vignetteEnabled = typeof VisualFX !== 'undefined' ? VisualFX.vignetteEnabled : true;

    view.innerHTML = `
      <div class="system-panel">
        <div class="system-section">
          <div class="system-section-title">Accent Theme</div>
          <div class="theme-swatches">${swatches}</div>
          <div class="system-hint">Theme applied immediately and persisted.</div>
        </div>
        <div class="system-section">
          <div class="system-section-title">Visual Effects</div>
          <label class="system-toggle-row">
            <span class="system-info-label">Matrix rain</span>
            <button id="matrix-toggle-btn" class="system-toggle-btn ${matrixEnabled ? 'on' : 'off'}">${matrixEnabled ? 'ON' : 'OFF'}</button>
          </label>
          <label class="system-toggle-row">
            <span class="system-info-label">CRT scanlines</span>
            <button id="crt-toggle-btn" class="system-toggle-btn ${crtEnabled ? 'on' : 'off'}">${crtEnabled ? 'ON' : 'OFF'}</button>
          </label>
          <label class="system-toggle-row">
            <span class="system-info-label">Vignette</span>
            <button id="vignette-toggle-btn" class="system-toggle-btn ${vignetteEnabled ? 'on' : 'off'}">${vignetteEnabled ? 'ON' : 'OFF'}</button>
          </label>
          <div class="system-hint">Visual overlays for the hacker workstation aesthetic.</div>
        </div>
        <div class="system-section">
          <div class="system-section-title">Leveling</div>
          <label class="system-toggle-row">
            <span class="system-info-label">XP &amp; levels</span>
            <button id="leveling-toggle-btn" class="system-toggle-btn ${levelingEnabled ? 'on' : 'off'}">${levelingEnabled ? 'ON' : 'OFF'}</button>
          </label>
          <div class="system-hint">Earn XP by reading feeds, accepting events and completing tasks.</div>
          ${levelingInfo}
        </div>
        <div class="system-section">
          <div class="system-section-title">Tasks</div>
          <label class="system-toggle-row">
            <span class="system-info-label">Projects Kanban</span>
            <button id="projects-kanban-toggle-btn" class="system-toggle-btn ${projectsKanbanEnabled ? 'on' : 'off'}">${projectsKanbanEnabled ? 'ON' : 'OFF'}</button>
          </label>
          <div class="system-hint">Shows or hides the embedded CryptPad Kanban board at the bottom of the Tasks panel.</div>
        </div>
        <div class="system-section">
          <div class="system-section-title">System Info</div>
          <div class="system-info-grid">
            <span class="system-info-label">Last briefing</span><span class="system-info-value">${lastBriefing}</span>
            <span class="system-info-label">Feed items</span><span class="system-info-value">${feedCount}</span>
            <span class="system-info-label">Streak</span><span class="system-info-value">#${streak}</span>
            <span class="system-info-label">Active theme</span><span class="system-info-value" id="system-theme-label">${this._esc(current)}</span>
          </div>
        </div>
      </div>`;

    view.querySelectorAll('.theme-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applyTheme(btn.dataset.theme);
        this.loadSystemTab();
      });
    });

    const matrixBtn = view.querySelector('#matrix-toggle-btn');
    if (matrixBtn) {
      matrixBtn.addEventListener('click', () => {
        if (typeof MatrixRain !== 'undefined') {
          const on = MatrixRain.toggle();
          matrixBtn.textContent = on ? 'ON' : 'OFF';
          matrixBtn.className = `system-toggle-btn ${on ? 'on' : 'off'}`;
        }
      });
    }

    const crtBtn = view.querySelector('#crt-toggle-btn');
    if (crtBtn) {
      crtBtn.addEventListener('click', () => {
        if (typeof VisualFX !== 'undefined') {
          const on = VisualFX.toggleCRT();
          crtBtn.textContent = on ? 'ON' : 'OFF';
          crtBtn.className = `system-toggle-btn ${on ? 'on' : 'off'}`;
        }
      });
    }

    const vignetteBtn = view.querySelector('#vignette-toggle-btn');
    if (vignetteBtn) {
      vignetteBtn.addEventListener('click', () => {
        if (typeof VisualFX !== 'undefined') {
          const on = VisualFX.toggleVignette();
          vignetteBtn.textContent = on ? 'ON' : 'OFF';
          vignetteBtn.className = `system-toggle-btn ${on ? 'on' : 'off'}`;
        }
      });
    }

    const levelingBtn = view.querySelector('#leveling-toggle-btn');
    if (levelingBtn) {
      levelingBtn.addEventListener('click', () => {
        if (typeof LevelSystem !== 'undefined') {
          const on = LevelSystem.toggle();
          levelingBtn.textContent = on ? 'ON' : 'OFF';
          levelingBtn.className = `system-toggle-btn ${on ? 'on' : 'off'}`;
          // Refresh to show / hide level stats
          this.loadSystemTab();
        }
      });
    }

    const projectsKanbanBtn = view.querySelector('#projects-kanban-toggle-btn');
    if (projectsKanbanBtn) {
      projectsKanbanBtn.addEventListener('click', () => {
        const on = !this.isProjectsKanbanEnabled();
        this.setProjectsKanbanEnabled(on);
        if (typeof TodoList !== 'undefined') TodoList.syncProjectsVisibility();
        if (typeof App !== 'undefined') {
          App.toast(on ? 'Projects Kanban enabled' : 'Projects Kanban disabled', 'info');
        }
        this.loadSystemTab();
      });
    }
  },

  applyTheme(name) {
    if (name === 'green' || !name) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', name);
    }
    localStorage.setItem('cyberspace-theme', name);
    if (typeof MatrixRain !== 'undefined') MatrixRain._refreshAccent();
  },

  loadTheme() {
    const saved = localStorage.getItem('cyberspace-theme');
    if (saved && saved !== 'green') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  },

  showView() {
    document.getElementById('settings-view').classList.remove('hidden');
    document.getElementById('settings-edit').classList.add('hidden');
    // config/seen-events.md and __system are auto-maintained — hide raw editor button
    document.getElementById('settings-edit-btn').style.display =
      (this.currentFile === 'config/seen-events.md' || this.currentFile === '__system') ? 'none' : '';
  },

  showEditor() {
    const raw = document.getElementById('settings-view').dataset.raw || '';
    document.getElementById('settings-editor').value = raw;
    document.getElementById('settings-view').classList.add('hidden');
    document.getElementById('settings-edit').classList.remove('hidden');
    document.getElementById('settings-edit-btn').style.display = 'none';
    document.getElementById('settings-editor').focus();
  },

  async save() {
    const content = document.getElementById('settings-editor').value;
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(this.currentFile)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: content,
      });
      if (!res.ok) throw new Error('Save failed');
      this.editing = false;
      this.showView();
      await this.loadFile();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  },
};
