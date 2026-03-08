/**
 * Projects panel — CryptPad Kanban integration.
 * Manages project metadata server-side (projects.json via REST API) and
 * embeds CryptPad Kanban boards via iframe using the &embed=true hash param.
 * Project task data is never stored server-side — CryptPad is the source of truth.
 */
const Projects = {
  projects: [],
  selectedId: null,
  _frameLoadTimer: null,
  _initialized: false,

  LS_SELECTED_KEY: 'cyberspace-selected-project',

  async init() {
    if (this._initialized) return this.refresh();
    this._initialized = true;
    this._buildPanel();
    await this.load();
    this._bindWebSocket();
  },

  async refresh() {
    await this.load();
  },

  async load() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to load projects');
      this.projects = await res.json();
    } catch (err) {
      console.warn('[projects] Failed to load:', err.message);
      this.projects = [];
    }

    // Restore or pick selected project
    const saved = localStorage.getItem(this.LS_SELECTED_KEY);
    const stillExists = this.projects.find(p => p.id === saved);
    this.selectedId = stillExists ? saved : (this.projects[0]?.id || null);

    this._renderSwitcher();

    if (this.selectedId) {
      const p = this.projects.find(p => p.id === this.selectedId);
      if (p) this._loadProject(p);
    } else {
      this._showEmpty();
    }
  },

  // ─── Panel DOM ──────────────────────────────────────────────────────────────

  _buildPanel() {
    const container = document.getElementById('rtab-projects');
    if (!container) return;

    container.innerHTML = `
      <div class="projects-panel">
        <div class="projects-switcher" id="projects-switcher"></div>
        <div class="projects-detail" id="projects-detail">
          <div class="projects-iframe-wrap" id="projects-iframe-wrap">

            <div class="projects-loading hidden" id="projects-loading">
              <span class="projects-loading-dot"></span>
              <span class="projects-loading-text">Connecting to CryptPad...</span>
            </div>

            <iframe
              id="cryptpad-frame"
              class="cryptpad-frame hidden"
              allow="clipboard-read; clipboard-write"
              title="CryptPad Kanban"
            ></iframe>

            <div class="projects-fallback hidden" id="projects-fallback">
              <div class="projects-fallback-icon">⛓</div>
              <div class="projects-fallback-title" id="projects-fallback-title"></div>
              <p class="projects-fallback-msg">CryptPad couldn't be embedded in this browser. Your board is one click away.</p>
              <a id="projects-fallback-link" class="projects-open-btn" href="#" target="_blank" rel="noopener noreferrer">Open in CryptPad ↗</a>
              <div class="projects-fallback-meta" id="projects-fallback-meta"></div>
              <div class="projects-fallback-diag hidden" id="projects-fallback-diag"></div>
            </div>

            <div class="projects-empty hidden" id="projects-empty">
              <div class="projects-empty-icon">🗂</div>
              <p class="projects-empty-msg">No projects yet.</p>
              <button class="projects-new-btn" id="projects-empty-new-btn">+ Add Your First Project</button>
            </div>

          </div>
        </div>
      </div>
    `;

    document.getElementById('projects-empty-new-btn')
      ?.addEventListener('click', () => this._openModal());
  },

  // ─── URL helpers ─────────────────────────────────────────────────────────────

  /** Return the URL for a project regardless of old/new schema. */
  _getProjectUrl(project) {
    return project.cryptpadUrl || project.cryptpadEditUrl || null;
  },

  /** Detect the URL type from the hash path component. */
  _detectUrlType(url) {
    if (!url) return 'unknown';
    const hash = url.includes('#') ? url.split('#')[1] : url;
    if (/\/embed\//.test(hash)) return 'embed';
    if (/\/view\//.test(hash))  return 'view';
    if (/\/edit\//.test(hash))  return 'edit';
    return 'unknown';
  },

  /**
   * Accept either a plain URL or a CryptPad <iframe src="..."> snippet.
   * Extracts the src attribute value if an iframe tag is detected.
   */
  _parseUrl(input) {
    const s = (input || '').trim();
    if (!s) return '';
    // If it looks like an iframe tag, pull out the src attribute
    if (/^</i.test(s)) {
      const m = s.match(/\bsrc=["']([^"']+)["']/i);
      return m ? m[1].trim() : s;
    }
    return s;
  },

  /** Human label + CSS class for URL types. */
  _typeLabel(type) {
    return {
      edit: { label: 'EDIT', cls: 'type-edit' },
      view: { label: 'VIEW', cls: 'type-view' },
      embed: { label: 'EMBED', cls: 'type-embed' },
      unknown: { label: '?', cls: 'type-unknown' },
    }[type] || { label: '?', cls: 'type-unknown' };
  },

  // ─── Switcher ────────────────────────────────────────────────────────────────

  _renderSwitcher() {
    const switcher = document.getElementById('projects-switcher');
    if (!switcher) return;

    const pills = this.projects.map(p => {
      const active  = p.id === this.selectedId ? ' active' : '';
      const url     = this._getProjectUrl(p);
      const type    = p.urlType || this._detectUrlType(url);
      const tl      = this._typeLabel(type);
      const dot     = p.color
        ? `<span class="project-pill-dot" style="background:${this.escAttr(p.color)}"></span>`
        : '';
      const badge   = `<span class="project-type-badge ${this.escAttr(tl.cls)}">${tl.label}</span>`;
      return `<button class="project-pill${active}" data-id="${this.escAttr(p.id)}" title="${this.escAttr(p.name)}">${dot}${this.escHtml(p.name)}${badge}</button>`;
    }).join('');

    const editBtn   = this.selectedId
      ? `<button class="projects-edit-btn" id="projects-edit-btn" title="Edit project">&#9998;</button>`
      : '';
    const deleteBtn = this.selectedId
      ? `<button class="projects-delete-btn" id="projects-delete-btn" title="Delete project">&#128465;</button>`
      : '';
    const newBtn    = `<button class="projects-new-pill-btn" id="projects-new-btn" title="Add project">+</button>`;

    switcher.innerHTML = `${pills}${newBtn}${editBtn}${deleteBtn}`;

    switcher.querySelectorAll('.project-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const { id } = btn.dataset;
        if (id === this.selectedId) return;
        this.selectedId = id;
        localStorage.setItem(this.LS_SELECTED_KEY, id);
        const p = this.projects.find(p => p.id === id);
        if (p) this._loadProject(p);
        this._renderSwitcher();
      });
    });

    document.getElementById('projects-new-btn')
      ?.addEventListener('click', () => this._openModal());

    document.getElementById('projects-edit-btn')
      ?.addEventListener('click', () => {
        const p = this.projects.find(p => p.id === this.selectedId);
        if (p) this._openModal(p);
      });

    document.getElementById('projects-delete-btn')
      ?.addEventListener('click', () => {
        const p = this.projects.find(p => p.id === this.selectedId);
        if (p && confirm(`Delete project "${p.name}"? This only removes it from the dashboard — your CryptPad board is not affected.`)) {
          this._deleteProject(p.id);
        }
      });
  },

  // ─── Iframe loading ──────────────────────────────────────────────────────────

  _loadProject(project) {
    const url     = this._getProjectUrl(project);
    const frame   = document.getElementById('cryptpad-frame');
    const loading = document.getElementById('projects-loading');
    const fallback = document.getElementById('projects-fallback');
    const empty   = document.getElementById('projects-empty');
    if (!frame) return;

    // CryptPad's CSP allows https: origins only — skip the iframe attempt on
    // plain HTTP to avoid a blocked-frame error in the console.
    if (window.location.protocol === 'http:') {
      loading.classList.add('hidden');
      fallback.classList.add('hidden');
      empty.classList.add('hidden');
      this._showFallback(project);
      return;
    }

    // Reset all states
    frame.classList.add('hidden');
    fallback.classList.add('hidden');
    empty.classList.add('hidden');
    loading.classList.remove('hidden');

    clearTimeout(this._frameLoadTimer);

    // Set sandbox dynamically so the attribute isn't present on an empty
    // iframe (which triggers a browser advisory about allow-scripts +
    // allow-same-origin even before any content loads).
    frame.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-storage-access-by-user-activation allow-downloads';

    frame.onload = () => {
      clearTimeout(this._frameLoadTimer);
      loading.classList.add('hidden');
      frame.classList.remove('hidden');
    };

    frame.onerror = () => {
      clearTimeout(this._frameLoadTimer);
      this._showFallback(project);
    };

    // Fail fast — 4s timeout.
    this._frameLoadTimer = setTimeout(() => {
      frame.onload  = null;
      frame.onerror = null;
      if (frame.classList.contains('hidden')) {
        this._showFallback(project);
      }
    }, 4000);

    frame.src = url || '';
  },

  async _showFallback(project) {
    const frame    = document.getElementById('cryptpad-frame');
    const loading  = document.getElementById('projects-loading');
    const fallback = document.getElementById('projects-fallback');

    frame.classList.add('hidden');
    loading.classList.add('hidden');
    fallback.classList.remove('hidden');

    const url     = this._getProjectUrl(project);
    const type    = project.urlType || this._detectUrlType(url);
    const tl      = this._typeLabel(type);

    const titleEl = document.getElementById('projects-fallback-title');
    const linkEl  = document.getElementById('projects-fallback-link');
    const metaEl  = document.getElementById('projects-fallback-meta');
    const diagEl  = document.getElementById('projects-fallback-diag');

    if (titleEl) {
      const badge = `<span class="project-type-badge ${this.escAttr(tl.cls)}">${tl.label}</span>`;
      titleEl.innerHTML = `${this.escHtml(project.name)} ${badge}`;
    }
    if (linkEl) linkEl.href = url || '#';

    const parts = [];
    if (project.description) parts.push(`<span class="projects-meta-line">${this.escHtml(project.description)}</span>`);
    const members = (project.members || []).join(', ');
    if (members) parts.push(`<span class="projects-meta-line"><span class="projects-meta-label">Members:</span> ${this.escHtml(members)}</span>`);
    if (metaEl) metaEl.innerHTML = parts.join('');

    // Run diagnostic check
    if (diagEl) {
      diagEl.classList.remove('hidden');
      if (type === 'edit') {
        diagEl.innerHTML = `<span class="diag-warn">⚠ Edit links require you to be signed in to CryptPad. Open the link directly, sign in, then come back if needed. For embedding, use <strong>Share → Embed</strong> inside CryptPad.</span>`;
      } else if (!url) {
        diagEl.innerHTML = `<span class="diag-info">ℹ No CryptPad URL configured for this project.</span>`;
      } else {
        diagEl.innerHTML = `<span class="diag-info">⟳ Checking embed headers…</span>`;
        const result = await this._checkEmbed(url);
        if (result.canEmbed) {
          diagEl.innerHTML = `<span class="diag-ok">✓ Server headers allow embedding — the iframe should work. Try refreshing if it stayed blank.</span>`;
        } else if (result.httpsOnly) {
          diagEl.innerHTML = `<span class="diag-warn">⚠ CryptPad allows embedding from HTTPS origins but the dashboard is on HTTP. Run <code>setup-https.ps1</code> once (as Administrator), then open <a href="https://localhost:3000" target="_blank" rel="noopener noreferrer">https://localhost:3000</a> instead.</span>`;
        } else if (result.frameAncestors) {
          diagEl.innerHTML = `<span class="diag-block">⊗ Blocked by <code>Content-Security-Policy: frame-ancestors ${this.escHtml(result.frameAncestors)}</code>. Use <em>Open in CryptPad ↗</em> above.</span>`;
        } else if (result.xFrameOptions) {
          diagEl.innerHTML = `<span class="diag-block">⊗ Blocked by <code>X-Frame-Options: ${this.escHtml(result.xFrameOptions)}</code>. Use <em>Open in CryptPad ↗</em> above.</span>`;
        } else if (result.error) {
          diagEl.innerHTML = `<span class="diag-warn">⚠ Could not check headers: ${this.escHtml(result.error)}.</span>`;
        } else {
          diagEl.innerHTML = `<span class="diag-info">ℹ Could not verify embed headers. Try opening the link directly.</span>`;
        }
      }
    }
  },

  async _checkEmbed(url) {
    if (!url) return { error: 'no URL' };
    try {
      const res = await fetch(`/api/projects/check-embed?url=${encodeURIComponent(url)}`);
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  },

  _showEmpty() {
    document.getElementById('cryptpad-frame')?.classList.add('hidden');
    document.getElementById('projects-loading')?.classList.add('hidden');
    document.getElementById('projects-fallback')?.classList.add('hidden');
    document.getElementById('projects-empty')?.classList.remove('hidden');
  },

  // ─── Modal (create / edit) ────────────────────────────────────────────────

  _openModal(project = null) {
    document.getElementById('projects-modal-overlay')?.remove();

    const isEdit      = !!project;
    const existingUrl = isEdit ? (this._getProjectUrl(project) || '') : '';
    const colors      = ['#00ff41', '#00bfff', '#ff6b35', '#e74c3c', '#f1c40f', '#9b59b6'];

    const colorPicker = colors.map(c => {
      const sel = (isEdit && project.color === c) || (!isEdit && c === '#00ff41') ? ' selected' : '';
      return `<button type="button" class="project-color-swatch${sel}" data-color="${this.escAttr(c)}" style="background:${this.escAttr(c)}" title="${this.escAttr(c)}"></button>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'projects-modal-overlay';
    overlay.className = 'projects-modal-overlay';
    overlay.innerHTML = `
      <div class="projects-modal" role="dialog" aria-modal="true">
        <div class="projects-modal-header">
          <span>${isEdit ? 'Edit Project' : 'New Project'}</span>
          <button class="projects-modal-close" id="projects-modal-close" title="Close">&times;</button>
        </div>
        <form class="projects-modal-form" id="projects-modal-form" novalidate autocomplete="off">

          <label class="projects-modal-label">Project Name <span class="pm-required">*</span></label>
          <input type="text" id="pm-name" class="projects-modal-input"
                 placeholder="Red Team Ops" maxlength="64"
                 value="${isEdit ? this.escAttr(project.name) : ''}" required>

          <label class="projects-modal-label">CryptPad URL <span class="pm-required">*</span></label>
          <input type="url" id="pm-url" class="projects-modal-input"
                 placeholder="https://cryptpad.fr/kanban/#/2/kanban/edit/.../embed/ or paste the &lt;iframe&gt; snippet"
                 value="${this.escAttr(existingUrl)}">
          <span class="projects-modal-hint">Paste the URL from your browser <strong>or</strong> the full <code>&lt;iframe src="…"&gt;</code> snippet from <strong>Share → Embed</strong> inside CryptPad. Type (edit / view / embed) is detected automatically.</span>

          <label class="projects-modal-label">Description <span class="pm-optional">(optional)</span></label>
          <textarea id="pm-desc" class="projects-modal-textarea"
                    placeholder="What is this project about?" maxlength="256" rows="2">${isEdit ? this.escHtml(project.description || '') : ''}</textarea>

          <label class="projects-modal-label">Members <span class="pm-optional">(optional)</span></label>
          <input type="text" id="pm-members" class="projects-modal-input"
                 placeholder="Alex, Sam, Jordan"
                 value="${isEdit ? this.escAttr((project.members || []).join(', ')) : ''}">
          <span class="projects-modal-hint">Comma-separated names — for reference, no account linking.</span>

          <label class="projects-modal-label">Color</label>
          <div class="projects-color-row" id="pm-color-row">${colorPicker}</div>

          <div class="projects-modal-error hidden" id="pm-error"></div>

          <div class="projects-modal-actions">
            <button type="submit" class="projects-modal-submit">${isEdit ? 'Save Changes' : 'Create Project'}</button>
            <button type="button" class="projects-modal-cancel" id="projects-modal-cancel-btn">Cancel</button>
          </div>

        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    let selectedColor = isEdit ? (project.color || colors[0]) : colors[0];

    overlay.querySelectorAll('.project-color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.project-color-swatch').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedColor = btn.dataset.color;
      });
    });

    const close = () => overlay.remove();
    document.getElementById('projects-modal-close')?.addEventListener('click', close);
    document.getElementById('projects-modal-cancel-btn')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('projects-modal-form').addEventListener('submit', async e => {
      e.preventDefault();
      const name        = document.getElementById('pm-name').value.trim();
      const cryptpadUrl = this._parseUrl(document.getElementById('pm-url').value);
      const desc        = document.getElementById('pm-desc').value.trim();
      const membersRaw  = document.getElementById('pm-members').value.trim();
      const members     = membersRaw ? membersRaw.split(',').map(m => m.trim()).filter(Boolean) : [];

      // Write the extracted URL back so the user sees the cleaned value
      const urlInput = document.getElementById('pm-url');
      if (urlInput && urlInput.value.trim() !== cryptpadUrl) urlInput.value = cryptpadUrl;

      if (!name)        return this._showModalError('Project name is required.');
      if (!cryptpadUrl) return this._showModalError('CryptPad URL is required.');
      if (!cryptpadUrl.startsWith('https://cryptpad.fr/'))
        return this._showModalError('URL must be a CryptPad link (https://cryptpad.fr/...).');

      const data = {
        name,
        cryptpadUrl,
        description: desc || null,
        members,
        color: selectedColor,
      };

      try {
        if (isEdit) {
          await this._updateProject(project.id, data);
        } else {
          await this._createProject(data);
        }
        close();
      } catch (err) {
        this._showModalError(err.message || 'Failed to save project.');
      }
    });

    setTimeout(() => document.getElementById('pm-name')?.focus(), 50);
  },

  _showModalError(msg) {
    const el = document.getElementById('pm-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  },

  // ─── CRUD helpers ────────────────────────────────────────────────────────────

  async _createProject(data) {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to create project');
    }
    await this.load();
    // Auto-select the newly created project (last in list)
    const newest = this.projects[this.projects.length - 1];
    if (newest) {
      this.selectedId = newest.id;
      localStorage.setItem(this.LS_SELECTED_KEY, newest.id);
      this._renderSwitcher();
      this._loadProject(newest);
    }
  },

  async _updateProject(id, data) {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update project');
    }
    await this.load();
  },

  async _deleteProject(id) {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (typeof App !== 'undefined') App.toast(body.error || 'Failed to delete project', 'error');
      return;
    }
    this.selectedId = null;
    localStorage.removeItem(this.LS_SELECTED_KEY);
    await this.load();
  },

  // ─── WebSocket ────────────────────────────────────────────────────────────────

  _bindWebSocket() {
    if (typeof WS === 'undefined') return;
    WS.on('projects_updated', () => this.load());
  },

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  escHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  },

  escAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },
};
