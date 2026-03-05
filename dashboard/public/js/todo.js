/**
 * NotionSync — bi-directional sync between the Todo panel and a Notion database.
 * Syncs: My Tasks, My Links, Further Reading.
 * Briefing Actions stay localStorage-only.
 */
const NotionSync = {
  configured: false,
  _syncing: false,
  _error: null,
  lastSync: null,
  _pollTimer: null,
  _debounceTimers: {},

  async init() {
    try {
      const r = await fetch('/api/notion/config');
      const d = await r.json();
      this.configured = d.configured;
    } catch { this.configured = false; }

    this._renderStatus();
    if (!this.configured) return;

    this._setSyncing(true);
    try {
      await this.pull();
      await this._pushOrphans();
    } catch (e) {
      this._error = e.message;
    } finally {
      this._setSyncing(false);
      this._renderStatus();
    }
    this._startPolling();
  },

  // ─── Pull: fetch Notion tasks and merge into localStorage ─────────────────

  async pull() {
    const r = await fetch('/api/notion/tasks');
    if (!r.ok) throw new Error('Notion fetch failed (' + r.status + ')');
    const { tasks } = await r.json();

    // Tasks
    let local = TodoList.getTasks();
    let changed = false;
    for (const nt of tasks.filter(t => t.type === 'task')) {
      const idx = local.findIndex(t => t.notionId === nt.notionId);
      if (idx >= 0) {
        const l = local[idx];
        const updated = { ...l, done: nt.done, text: nt.text,
          assignedTo: nt.assignedTo, priority: nt.priority,
          dueDate: nt.dueDate, tags: nt.tags };
        if (JSON.stringify(l) !== JSON.stringify(updated)) {
          local[idx] = updated;
          changed = true;
        }
      } else {
        local.push({
          id: Date.now() + Math.round(Math.random() * 1000),
          notionId: nt.notionId,
          text: nt.text,
          done: nt.done,
          createdAt: Date.now(),
          assignedTo: nt.assignedTo,
          priority: nt.priority,
          dueDate: nt.dueDate,
          tags: nt.tags,
        });
        changed = true;
      }
    }
    if (changed) { TodoList.saveTasks(local); TodoList.renderMyTasks(); }

    // Links
    let links = TodoList.getLinks();
    changed = false;
    for (const nt of tasks.filter(t => t.type === 'link')) {
      const idx = links.findIndex(l => l.notionId === nt.notionId);
      if (idx >= 0) {
        if (links[idx].url !== nt.text) { links[idx].url = nt.text; changed = true; }
      } else {
        links.push({ id: Date.now() + Math.round(Math.random() * 1000),
          notionId: nt.notionId, url: nt.text, addedAt: Date.now() });
        changed = true;
      }
    }
    if (changed) { TodoList.saveLinks(links); TodoList.renderMyLinks(); }

    // Further reading: if Notion marks one as done, hide it locally too
    for (const nt of tasks.filter(t => t.type === 'further-reading' && nt.done && nt.sourceDate && nt.text)) {
      const key = `briefing-further-hidden-${nt.sourceDate}`;
      try {
        const h = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
        if (!h.has(nt.text)) { h.add(nt.text); localStorage.setItem(key, JSON.stringify([...h])); }
      } catch { /* ignore */ }
    }
    if (TodoList.briefingDate) TodoList.renderFurtherReading();

    this.lastSync = Date.now();
    this._error = null;
    this._renderStatus();
  },

  // ─── Push local items that have no Notion ID yet ───────────────────────────

  async _pushOrphans() {
    // Tasks
    let tasks = TodoList.getTasks();
    let changed = false;
    for (const t of tasks.filter(t => !t.notionId)) {
      const nt = await this._apiCreate({
        text: t.text, type: 'task', done: t.done,
        assignedTo: t.assignedTo || [], priority: t.priority || null,
        dueDate: t.dueDate || null, tags: t.tags || [],
        dashboardId: String(t.id),
      });
      if (nt.notionId) { t.notionId = nt.notionId; changed = true; }
    }
    if (changed) { TodoList.saveTasks(tasks); TodoList.renderMyTasks(); }

    // Links
    let links = TodoList.getLinks();
    changed = false;
    for (const l of links.filter(l => !l.notionId)) {
      const nt = await this._apiCreate({
        text: l.url, type: 'link', done: false, dashboardId: String(l.id),
      });
      if (nt.notionId) { l.notionId = nt.notionId; changed = true; }
    }
    if (changed) { TodoList.saveLinks(links); TodoList.renderMyLinks(); }

    // Further reading for today's briefing
    if (TodoList.briefingDate && TodoList.furtherReadingItems.length) {
      await this._pushFurtherReading(TodoList.briefingDate, TodoList.furtherReadingItems);
    }
  },

  async _pushFurtherReading(date, items) {
    const key = `notion-fr-synced-${date}`;
    let synced;
    try { synced = new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch { synced = new Set(); }

    const hidden = TodoList.getHiddenFurtherReading();
    for (const item of items) {
      if (synced.has(item.url)) continue;
      const nt = await this._apiCreate({
        text: item.url,
        type: 'further-reading',
        done: hidden.has(item.url),
        sourceDate: date,
        tags: item.title ? [item.title] : [],
        dashboardId: `fr-${date}-${this._hashCode(item.url)}`,
      });
      if (nt.notionId) synced.add(item.url);
    }
    localStorage.setItem(key, JSON.stringify([...synced]));
  },

  // ─── Lifecycle hooks called by TodoList ────────────────────────────────────

  onTaskCreated(task) {
    if (!this.configured) return;
    this._apiCreate({
      text: task.text, type: 'task', done: task.done,
      assignedTo: task.assignedTo || [], priority: task.priority || null,
      dueDate: task.dueDate || null, tags: task.tags || [],
      dashboardId: String(task.id),
    }).then(nt => {
      if (nt.notionId) {
        const tasks = TodoList.getTasks();
        const t = tasks.find(x => x.id === task.id);
        if (t) { t.notionId = nt.notionId; TodoList.saveTasks(tasks); TodoList.renderMyTasks(); }
      }
    });
  },

  onTaskUpdated(id) {
    if (!this.configured) return;
    clearTimeout(this._debounceTimers['t' + id]);
    this._debounceTimers['t' + id] = setTimeout(() => {
      const task = TodoList.getTasks().find(t => t.id === id);
      if (!task?.notionId) return;
      this._apiUpdate(task.notionId, {
        done: task.done, text: task.text,
        assignedTo: task.assignedTo || [], priority: task.priority || null,
        dueDate: task.dueDate || null, tags: task.tags || [],
      });
    }, 500);
  },

  onTaskDeleted(notionId) {
    if (!this.configured || !notionId) return;
    this._apiArchive(notionId);
  },

  onLinkCreated(link) {
    if (!this.configured) return;
    this._apiCreate({ text: link.url, type: 'link', done: false, dashboardId: String(link.id) })
      .then(nt => {
        if (nt.notionId) {
          const links = TodoList.getLinks();
          const l = links.find(x => x.id === link.id);
          if (l) { l.notionId = nt.notionId; TodoList.saveLinks(links); TodoList.renderMyLinks(); }
        }
      });
  },

  onLinkDeleted(notionId) {
    if (!this.configured || !notionId) return;
    this._apiArchive(notionId);
  },

  onFurtherReadingHidden(date, item) {
    if (!this.configured) return;
    // Find the matching Notion page (by sourceDate + text) and mark it done
    fetch('/api/notion/tasks')
      .then(r => r.json())
      .then(({ tasks }) => {
        const nt = tasks.find(t =>
          t.type === 'further-reading' && t.sourceDate === date && t.text === item.url);
        if (nt) this._apiUpdate(nt.notionId, { done: true });
      })
      .catch(() => {});
  },

  onBriefingDateChanged(date, items) {
    if (!this.configured || !date || !items.length) return;
    this._pushFurtherReading(date, items).catch(() => {});
  },

  // ─── API helpers ──────────────────────────────────────────────────────────

  async _apiCreate(data) {
    try {
      const r = await fetch('/api/notion/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await r.json();
    } catch { return {}; }
  },

  async _apiUpdate(notionId, patch) {
    try {
      await fetch(`/api/notion/tasks/${encodeURIComponent(notionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch { /* best-effort */ }
  },

  async _apiArchive(notionId) {
    try {
      await fetch(`/api/notion/tasks/${encodeURIComponent(notionId)}`, { method: 'DELETE' });
    } catch { /* best-effort */ }
  },

  // ─── Polling ──────────────────────────────────────────────────────────────

  _startPolling() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = setInterval(() => {
      if (!document.hidden && this.configured) {
        this._setSyncing(true);
        this.pull()
          .catch(e => { this._error = e.message; })
          .finally(() => { this._setSyncing(false); this._renderStatus(); });
      }
    }, 30000);
  },

  // ─── Status bar ───────────────────────────────────────────────────────────

  _setSyncing(v)  { this._syncing = v; this._renderStatus(); },

  _renderStatus() {
    const el = document.getElementById('notion-sync-status');
    if (!el) return;
    if (!this.configured) {
      el.innerHTML = '<span class="notion-status-off" title="Notion not configured">◌ Notion</span>';
      return;
    }
    if (this._syncing) {
      el.innerHTML = '<span class="notion-status-syncing">↻ Syncing...</span>';
      return;
    }
    if (this._error) {
      el.innerHTML = `<span class="notion-status-error" title="${TodoList.escHtml(this._error)}">&#9888; Sync error</span>`;
      return;
    }
    const t = this.lastSync
      ? new Date(this.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '—';
    el.innerHTML = `<span class="notion-status-ok" title="Last synced ${t}">&#10003; Synced ${t}</span>`;
  },

  // ─── Utility ──────────────────────────────────────────────────────────────

  _hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(16).padStart(8, '0').slice(0, 8);
  },
};

/**
 * TodoList — persisted task list with four sections:
 *   1. Briefing Actions  — auto-extracted from today's briefing (shared checkbox state)
 *   2. Further Reading   — links auto-extracted from today's briefing
 *   3. My Tasks          — user-created text tasks (localStorage)
 *   4. My Links          — user-saved URLs (localStorage)
 */
const TodoList = {
  TASKS_KEY: 'cyberspace-todos',
  LINKS_KEY: 'cyberspace-links',

  briefingDate: null,
  briefingActions: [],      // [{ index, text }]
  furtherReadingItems: [],  // [{ title, url }]

  // ─── Init ────────────────────────────────────────────────────────────────

  async init() {
    this.bindEvents();
    await this.loadBriefingContentForDate(App.activeDate || (Briefing.dates && Briefing.dates[0]));
    this.renderMyTasks();
    this.renderMyLinks();
    await NotionSync.init();
  },

  bindEvents() {
    // My Tasks
    const taskInput = document.getElementById('todo-new-input');
    const taskBtn   = document.getElementById('todo-add-btn');
    taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addTask(); }
    });
    taskBtn.addEventListener('click', () => this.addTask());

    // Task metadata expand/collapse toggle
    const metaToggle = document.getElementById('todo-task-meta-toggle');
    if (metaToggle) {
      metaToggle.addEventListener('click', () => {
        const panel = document.getElementById('todo-task-meta');
        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !isHidden);
        metaToggle.classList.toggle('active', isHidden);
      });
    }

    // My Links
    const linkInput = document.getElementById('todo-link-input');
    const linkBtn   = document.getElementById('todo-link-add-btn');
    linkInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addLink(); }
    });
    linkBtn.addEventListener('click', () => this.addLink());

    // Notion config panel toggle
    const notionToggle = document.getElementById('notion-config-toggle');
    if (notionToggle) {
      notionToggle.addEventListener('click', () => {
        document.getElementById('notion-config-panel').classList.toggle('hidden');
      });
    }

    // Notion save button
    const notionSaveBtn = document.getElementById('notion-save-btn');
    if (notionSaveBtn) {
      notionSaveBtn.addEventListener('click', async () => {
        const token = (document.getElementById('notion-token-input').value || '').trim();
        const dbId  = (document.getElementById('notion-dbid-input').value || '').trim();
        const msg   = document.getElementById('notion-config-msg');
        msg.textContent = 'Saving...';
        msg.className = 'notion-config-msg';
        try {
          const r = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notion_token: token, notion_db_id: dbId }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Failed to save');
          msg.textContent = d.configured ? '\u2713 Saved — reconnecting...' : '\u2713 Cleared';
          msg.className = 'notion-config-msg ok';
          NotionSync.configured = d.configured;
          NotionSync._renderStatus();
          if (d.configured) setTimeout(() => NotionSync.init(), 400);
        } catch (e) {
          msg.textContent = '\u2717 ' + e.message;
          msg.className = 'notion-config-msg error';
        }
      });
    }
  },

  // ─── Briefing content (actions + further reading) ────────────────────────

  /**
   * Load briefing actions + further reading for a specific date.
   * Called by App.setActiveDate() whenever the user navigates briefing days.
   */
  async loadBriefingContentForDate(date) {
    const dateEl = document.getElementById('todo-briefing-date');

    if (!date) {
      this.briefingActions = [];
      this.furtherReadingItems = [];
      this.briefingDate = null;
      this.renderBriefingActions();
      this.renderFurtherReading();
      return;
    }

    this.briefingDate = date;
    if (dateEl) dateEl.textContent = date;

    try {
      const res = await fetch(`/api/file?path=reports/${date}/briefing.md`);
      if (!res.ok) throw new Error('not found');
      const markdown = await res.text();
      this.briefingActions     = this.parseActionItems(markdown);
      this.furtherReadingItems = this.parseFurtherReading(markdown);
    } catch {
      this.briefingActions = [];
      this.furtherReadingItems = [];
    }

    this.renderBriefingActions();
    this.renderFurtherReading();

    // Push new further reading items to Notion (non-blocking)
    if (date) NotionSync.onBriefingDateChanged(date, this.furtherReadingItems);
  },

  /** Legacy wrapper — still used internally. */
  async loadBriefingContent() {
    const date = App.activeDate || (Briefing.dates && Briefing.dates[0]);
    await this.loadBriefingContentForDate(date);
  },

  /**
   * Extract action items, tracking their position in the full checkbox
   * sequence so we share state with the briefing panel.
   */
  parseActionItems(markdown) {
    const lines = markdown.split('\n');
    let inSection = false;
    let checkboxIndex = 0;
    const items = [];

    for (const line of lines) {
      const isCheckbox = /^[-*] \[[ xX]\]/.test(line);

      if (/^##\s+Action Items/i.test(line)) {
        inSection = true;
      } else if (/^##\s+/.test(line) && inSection) {
        inSection = false;
      }

      if (isCheckbox) {
        if (inSection) {
          const raw  = line.replace(/^[-*] \[[ xX]\]\s*/, '').trim();
          const text = this.stripMarkdown(raw);
          items.push({ index: checkboxIndex, text });
        }
        checkboxIndex++;
      }
    }

    return items;
  },

  /**
   * Extract links from the ## Further Reading section.
   */
  parseFurtherReading(markdown) {
    const lines = markdown.split('\n');
    let inSection = false;
    const items = [];

    for (const line of lines) {
      if (/^##\s+Further Reading/i.test(line)) { inSection = true; continue; }
      if (/^##\s+/.test(line) && inSection)    { inSection = false; }

      if (inSection) {
        // [Title](url)
        const linked = line.match(/^[-*]\s+\[([^\]]+)\]\(([^)]+)\)/);
        if (linked) {
          items.push({ title: linked[1].trim(), url: linked[2].trim() });
          continue;
        }
        // bare URL
        const bare = line.match(/^[-*]\s+(https?:\/\/\S+)/);
        if (bare) {
          items.push({ title: null, url: bare[1].trim() });
        }
      }
    }

    return items;
  },

  // ─── Briefing action checkbox state (shared with briefing panel) ──────────

  getBriefingChecks() {
    if (!this.briefingDate) return {};
    try { return JSON.parse(localStorage.getItem(`checkboxes-${this.briefingDate}`) || '{}'); }
    catch { return {}; }
  },

  saveBriefingChecks(checks) {
    if (!this.briefingDate) return;
    localStorage.setItem(`checkboxes-${this.briefingDate}`, JSON.stringify(checks));
  },

  toggleBriefingAction(index) {
    const checks = this.getBriefingChecks();
    checks[index] = !checks[index];
    this.saveBriefingChecks(checks);
    if (checks[index] && typeof LevelSystem !== 'undefined') {
      LevelSystem.reward('action', `${this.briefingDate}-${index}`);
    }
    this.renderBriefingActions();
  },

  // Hidden action indices — stored per briefing date, resets automatically with new briefings
  getHiddenActions() {
    if (!this.briefingDate) return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(`briefing-actions-hidden-${this.briefingDate}`) || '[]'));
    } catch { return new Set(); }
  },

  hideAction(index) {
    const hidden = this.getHiddenActions();
    hidden.add(index);
    localStorage.setItem(`briefing-actions-hidden-${this.briefingDate}`, JSON.stringify([...hidden]));
    this.renderBriefingActions();
  },

  renderBriefingActions() {
    const container = document.getElementById('todo-briefing-list');
    if (!container) return;

    const hidden  = this.getHiddenActions();
    const visible = this.briefingActions.filter(item => !hidden.has(item.index));

    if (visible.length === 0) {
      container.innerHTML = '<div class="todo-empty">No action items in today\'s briefing</div>';
      return;
    }

    const checks = this.getBriefingChecks();
    container.innerHTML = visible.map(item => {
      const done = !!checks[item.index];
      return `<div class="todo-item${done ? ' todo-done' : ''}">
        <input type="checkbox" class="todo-checkbox briefing-action-cb"
               ${done ? 'checked' : ''} data-index="${item.index}">
        <span class="todo-text">${this.escHtml(item.text)}</span>
        <button class="todo-delete-btn briefing-action-del" data-index="${item.index}" title="Remove">×</button>
      </div>`;
    }).join('');

    container.querySelectorAll('.briefing-action-cb').forEach(cb => {
      cb.addEventListener('change', () => this.toggleBriefingAction(parseInt(cb.dataset.index)));
    });
    container.querySelectorAll('.briefing-action-del').forEach(btn => {
      btn.addEventListener('click', () => this.hideAction(parseInt(btn.dataset.index)));
    });
  },

  // ─── Further Reading ─────────────────────────────────────────────────────

  // Hidden further-reading URLs — stored per briefing date
  getHiddenFurtherReading() {
    if (!this.briefingDate) return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(`briefing-further-hidden-${this.briefingDate}`) || '[]'));
    } catch { return new Set(); }
  },

  hideFurtherReading(url) {
    const hidden = this.getHiddenFurtherReading();
    hidden.add(url);
    localStorage.setItem(`briefing-further-hidden-${this.briefingDate}`, JSON.stringify([...hidden]));
    this.renderFurtherReading();
    const item = this.furtherReadingItems.find(i => i.url === url);
    if (item) NotionSync.onFurtherReadingHidden(this.briefingDate, item);
  },

  renderFurtherReading() {
    const container = document.getElementById('todo-further-reading-list');
    if (!container) return;

    const hidden  = this.getHiddenFurtherReading();
    const visible = this.furtherReadingItems.filter(item => !hidden.has(item.url));

    if (visible.length === 0) {
      container.innerHTML = '<div class="todo-empty">No further reading in today\'s briefing</div>';
      return;
    }

    container.innerHTML = visible.map(item => {
      const display = item.title || this.getDomain(item.url);
      const domain  = this.getDomain(item.url);
      return `<div class="todo-link-item">
        <a href="${this.escHtml(item.url)}" target="_blank" class="todo-link" title="${this.escHtml(item.url)}">
          <span class="todo-link-icon">↗</span>
          <span class="todo-link-title">${this.escHtml(display)}</span>
          ${item.title ? `<span class="todo-link-domain">${this.escHtml(domain)}</span>` : ''}
        </a>
        <button class="todo-delete-btn further-reading-del" data-url="${this.escHtml(item.url)}" title="Remove">×</button>
      </div>`;
    }).join('');

    container.querySelectorAll('.further-reading-del').forEach(btn => {
      btn.addEventListener('click', () => this.hideFurtherReading(btn.dataset.url));
    });
  },

  // ─── My Tasks ────────────────────────────────────────────────────────────

  getTasks() {
    try { return JSON.parse(localStorage.getItem(this.TASKS_KEY) || '[]'); }
    catch { return []; }
  },

  saveTasks(tasks) {
    localStorage.setItem(this.TASKS_KEY, JSON.stringify(tasks));
  },

  addTask() {
    const input = document.getElementById('todo-new-input');
    const text  = input.value.trim();
    if (!text) return;

    const assigneeEl = document.getElementById('todo-task-assignee');
    const priorityEl = document.getElementById('todo-task-priority');
    const dueEl      = document.getElementById('todo-task-due');
    const tagsEl     = document.getElementById('todo-task-tags');

    const assignedTo = assigneeEl?.value.trim() ? [assigneeEl.value.trim()] : [];
    const priority   = priorityEl?.value || null;
    const dueDate    = dueEl?.value || null;
    const tags       = tagsEl?.value.trim()
      ? tagsEl.value.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const task = { id: Date.now(), text, done: false, createdAt: Date.now(),
      assignedTo, priority, dueDate, tags };

    const tasks = this.getTasks();
    tasks.push(task);
    this.saveTasks(tasks);

    // Reset inputs
    input.value = '';
    if (assigneeEl) assigneeEl.value = '';
    if (priorityEl) priorityEl.value = '';
    if (dueEl)      dueEl.value = '';
    if (tagsEl)     tagsEl.value = '';

    this.renderMyTasks();
    NotionSync.onTaskCreated(task);
  },

  toggleTask(id) {
    const tasks = this.getTasks();
    const task  = tasks.find(t => t.id === id);
    if (task) {
      task.done = !task.done;
      this.saveTasks(tasks);
      if (task.done && typeof LevelSystem !== 'undefined') {
        LevelSystem.reward('task', String(id));
      }
      this.renderMyTasks();
      NotionSync.onTaskUpdated(id);
    }
  },

  deleteTask(id) {
    const tasks = this.getTasks();
    const task = tasks.find(t => t.id === id);
    this.saveTasks(tasks.filter(t => t.id !== id));
    this.renderMyTasks();
    if (task?.notionId) NotionSync.onTaskDeleted(task.notionId);
  },

  renderMyTasks() {
    const container = document.getElementById('todo-my-list');
    if (!container) return;

    const tasks = this.getTasks();
    if (tasks.length === 0) {
      container.innerHTML = '<div class="todo-empty">No tasks yet — type above and press Enter</div>';
      return;
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const soon  = new Date(today); soon.setDate(soon.getDate() + 3);

    container.innerHTML = tasks.map(task => {
      // Notion sync indicator
      const syncState = NotionSync.configured ? (task.notionId ? 'synced' : 'pending') : '';
      const syncIcon  = NotionSync.configured ? (task.notionId ? '&#10003;' : '&#8635;') : '';

      // Priority badge
      const priClass = task.priority ? `todo-priority-${task.priority.toLowerCase()}` : '';
      const priBadge = task.priority
        ? `<span class="todo-tag ${priClass}">${this.escHtml(task.priority)}</span>` : '';

      // Due date badge
      let dueBadge = '';
      if (task.dueDate) {
        const d     = new Date(task.dueDate + 'T00:00:00');
        const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const cls   = d < today ? 'overdue' : d <= soon ? 'soon' : '';
        dueBadge = `<span class="todo-due ${cls}" title="Due ${this.escHtml(task.dueDate)}">${this.escHtml(label)}</span>`;
      }

      // Tags
      const tagBadges = (task.tags || [])
        .map(t => `<span class="todo-tag">${this.escHtml(t)}</span>`).join('');

      // Assignees
      const assignees = task.assignedTo || [];
      const assigneeBadge = assignees.length
        ? `<span class="todo-assignee">${this.escHtml(assignees.map(a => '@' + a).join(', '))}</span>` : '';

      const hasMeta = task.priority || task.dueDate || (task.tags && task.tags.length) || assignees.length;
      const metaRow = hasMeta
        ? `<div class="todo-item-meta">${priBadge}${tagBadges}${dueBadge}${assigneeBadge}</div>` : '';

      const syncEl = NotionSync.configured
        ? `<span class="todo-sync-state ${syncState}" title="${syncState === 'synced' ? 'Synced with Notion' : 'Pending sync'}">${syncIcon}</span>` : '';

      return `<div class="todo-item${task.done ? ' todo-done' : ''}" data-id="${task.id}" draggable="true">
        <span class="todo-drag-handle" title="Drag to reorder">&#8959;</span>
        <input type="checkbox" class="todo-checkbox my-task-cb"
               ${task.done ? 'checked' : ''} data-id="${task.id}">
        <div class="todo-item-body">
          <span class="todo-text">${this.escHtml(task.text)}</span>
          ${metaRow}
        </div>
        ${syncEl}
        <button class="todo-delete-btn" data-id="${task.id}" title="Remove">&#215;</button>
      </div>`;
    }).join('');

    container.querySelectorAll('.my-task-cb').forEach(cb => {
      cb.addEventListener('change', () => this.toggleTask(Number(cb.dataset.id)));
    });
    container.querySelectorAll('.todo-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteTask(Number(btn.dataset.id)));
    });
    this.enableDragReorder(container, 'tasks');
  },

  // ─── My Links ────────────────────────────────────────────────────────────

  getLinks() {
    try { return JSON.parse(localStorage.getItem(this.LINKS_KEY) || '[]'); }
    catch { return []; }
  },

  saveLinks(links) {
    localStorage.setItem(this.LINKS_KEY, JSON.stringify(links));
  },

  addLink() {
    const input = document.getElementById('todo-link-input');
    let url = input.value.trim();
    if (!url) return;
    // Auto-prepend https:// if protocol missing
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const link = { id: Date.now(), url, addedAt: Date.now() };
    const links = this.getLinks();
    links.push(link);
    this.saveLinks(links);
    input.value = '';
    this.renderMyLinks();
    NotionSync.onLinkCreated(link);
  },

  deleteLink(id) {
    const links = this.getLinks();
    const link = links.find(l => l.id === id);
    this.saveLinks(links.filter(l => l.id !== id));
    this.renderMyLinks();
    if (link?.notionId) NotionSync.onLinkDeleted(link.notionId);
  },

  renderMyLinks() {
    const container = document.getElementById('todo-my-links-list');
    if (!container) return;

    const links = this.getLinks();
    if (links.length === 0) {
      container.innerHTML = '<div class="todo-empty">No saved links yet — paste a URL above</div>';
      return;
    }

    container.innerHTML = links.map(link => `
      <div class="todo-link-item todo-link-saved" data-id="${link.id}" draggable="true">
        <span class="todo-drag-handle" title="Drag to reorder">⠿</span>
        <a href="${this.escHtml(link.url)}" target="_blank" class="todo-link" title="${this.escHtml(link.url)}">
          <span class="todo-link-icon">↗</span>
          <span class="todo-link-title">${this.escHtml(this.getDomain(link.url))}</span>
        </a>
        <button class="todo-delete-btn" data-id="${link.id}" title="Remove">×</button>
      </div>
    `).join('');

    container.querySelectorAll('.todo-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteLink(Number(btn.dataset.id)));
    });
    this.enableDragReorder(container, 'links');
  },

  // ─── Drag-and-Drop Reordering ────────────────────────────────────────────

  enableDragReorder(container, type) {
    let dragEl = null;

    container.querySelectorAll('[draggable="true"]').forEach(el => {
      // Only start drag from the handle
      el.addEventListener('mousedown', (e) => {
        if (e.target.closest('.todo-drag-handle')) {
          el.setAttribute('draggable', 'true');
        } else {
          el.setAttribute('draggable', 'false');
        }
      });

      el.addEventListener('dragstart', (e) => {
        dragEl = el;
        el.classList.add('todo-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', el.dataset.id);
      });

      el.addEventListener('dragend', () => {
        if (dragEl) dragEl.classList.remove('todo-dragging');
        dragEl = null;
        container.querySelectorAll('.todo-drag-over').forEach(x => x.classList.remove('todo-drag-over'));
        // Re-enable draggable
        container.querySelectorAll('[draggable]').forEach(x => x.setAttribute('draggable', 'true'));
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (el !== dragEl) el.classList.add('todo-drag-over');
      });

      el.addEventListener('dragleave', () => {
        el.classList.remove('todo-drag-over');
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('todo-drag-over');
        if (!dragEl || el === dragEl) return;

        const fromId = Number(dragEl.dataset.id);
        const toId   = Number(el.dataset.id);
        if (type === 'tasks') this.reorderTasks(fromId, toId);
        else this.reorderLinks(fromId, toId);
      });
    });
  },

  reorderTasks(fromId, toId) {
    const tasks = this.getTasks();
    const fromIdx = tasks.findIndex(t => t.id === fromId);
    const toIdx   = tasks.findIndex(t => t.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = tasks.splice(fromIdx, 1);
    tasks.splice(toIdx, 0, moved);
    this.saveTasks(tasks);
    this.renderMyTasks();
  },

  reorderLinks(fromId, toId) {
    const links = this.getLinks();
    const fromIdx = links.findIndex(l => l.id === fromId);
    const toIdx   = links.findIndex(l => l.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = links.splice(fromIdx, 1);
    links.splice(toIdx, 0, moved);
    this.saveLinks(links);
    this.renderMyLinks();
  },

  // ─── Helpers ─────────────────────────────────────────────────────────────

  escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  },

  getDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  },

  stripMarkdown(text) {
    return text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
      .trim();
  },

  // Called when switching to the Tasks tab — refresh if briefing date changed
  refresh() {
    const activeDate = App.activeDate || (Briefing.dates && Briefing.dates[0]);
    if (activeDate && activeDate !== this.briefingDate) {
      this.loadBriefingContentForDate(activeDate);
    } else {
      this.renderBriefingActions();
      this.renderFurtherReading();
    }
  },
};
