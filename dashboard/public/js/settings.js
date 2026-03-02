/**
 * Settings panel — renders config files as formatted markdown.
 * Pencil icon toggles raw textarea editing.
 */
const Settings = {
  currentFile: 'interests.md',
  editing: false,

  init() {
    this.bindEvents();
  },

  bindEvents() {
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

    // RSS feeds get a visual manager unless raw editing is active
    if (this.currentFile === 'rss.md' && !this.editing) {
      await this.loadRssVisual();
      return;
    }

    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(this.currentFile)}`);
      if (!res.ok) throw new Error('File not found');
      const content = await res.text();

      // Render as markdown
      view.innerHTML = `<div class="markdown-body">${marked.parse(content)}</div>`;

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
      const res = await fetch('/api/file?path=rss.md');
      if (!res.ok) throw new Error('rss.md not found');
      const content = await res.text();
      view.dataset.raw = content;
      const feeds = this.parseRssMd(content);
      this.renderRssVisual(feeds);
    } catch (err) {
      view.innerHTML = `<div class="empty-state">Could not load rss.md: ${err.message}</div>`;
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
          const encodedUrl = this._esc(feed.url);
          html += `<div class="rss-feed-card">
            <div class="rss-feed-url">${encodedUrl}</div>
            <div class="rss-feed-actions">
              <span class="rss-priority-badge ${feed.priority}">${feed.priority}</span>
              <button class="rss-test-btn" data-url="${encodedUrl}">Test</button>
              <button class="rss-remove-btn" data-url="${encodedUrl}">Remove</button>
              <span class="rss-test-result" id="result-${this._urlId(feed.url)}"></span>
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
      const res = await fetch('/api/file?path=rss.md');
      if (!res.ok) throw new Error('Could not read rss.md');
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

      await fetch('/api/file?path=rss.md', {
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
      const res = await fetch('/api/file?path=rss.md');
      if (!res.ok) throw new Error('Could not read rss.md');
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

      await fetch('/api/file?path=rss.md', {
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

  showView() {
    document.getElementById('settings-view').classList.remove('hidden');
    document.getElementById('settings-edit').classList.add('hidden');
  },

  showEditor() {
    const raw = document.getElementById('settings-view').dataset.raw || '';
    document.getElementById('settings-editor').value = raw;
    document.getElementById('settings-view').classList.add('hidden');
    document.getElementById('settings-edit').classList.remove('hidden');
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
