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
    await this.loadBriefingContent();
    this.renderMyTasks();
    this.renderMyLinks();
  },

  bindEvents() {
    // My Tasks
    const taskInput = document.getElementById('todo-new-input');
    const taskBtn   = document.getElementById('todo-add-btn');
    taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addTask(); }
    });
    taskBtn.addEventListener('click', () => this.addTask());

    // My Links
    const linkInput = document.getElementById('todo-link-input');
    const linkBtn   = document.getElementById('todo-link-add-btn');
    linkInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addLink(); }
    });
    linkBtn.addEventListener('click', () => this.addLink());
  },

  // ─── Briefing content (actions + further reading) ────────────────────────

  async loadBriefingContent() {
    const date = Briefing.dates && Briefing.dates[0];
    const dateEl = document.getElementById('todo-briefing-date');

    if (!date) {
      this.briefingActions = [];
      this.furtherReadingItems = [];
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
    const tasks = this.getTasks();
    tasks.push({ id: Date.now(), text, done: false, createdAt: Date.now() });
    this.saveTasks(tasks);
    input.value = '';
    this.renderMyTasks();
  },

  toggleTask(id) {
    const tasks = this.getTasks();
    const task  = tasks.find(t => t.id === id);
    if (task) { task.done = !task.done; this.saveTasks(tasks); this.renderMyTasks(); }
  },

  deleteTask(id) {
    this.saveTasks(this.getTasks().filter(t => t.id !== id));
    this.renderMyTasks();
  },

  renderMyTasks() {
    const container = document.getElementById('todo-my-list');
    if (!container) return;

    const tasks = this.getTasks();
    if (tasks.length === 0) {
      container.innerHTML = '<div class="todo-empty">No tasks yet — type above and press Enter</div>';
      return;
    }

    container.innerHTML = tasks.map(task => `
      <div class="todo-item${task.done ? ' todo-done' : ''}" data-id="${task.id}">
        <input type="checkbox" class="todo-checkbox my-task-cb"
               ${task.done ? 'checked' : ''} data-id="${task.id}">
        <span class="todo-text">${this.escHtml(task.text)}</span>
        <button class="todo-delete-btn" data-id="${task.id}" title="Remove">×</button>
      </div>
    `).join('');

    container.querySelectorAll('.my-task-cb').forEach(cb => {
      cb.addEventListener('change', () => this.toggleTask(Number(cb.dataset.id)));
    });
    container.querySelectorAll('.todo-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteTask(Number(btn.dataset.id)));
    });
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
    const links = this.getLinks();
    links.push({ id: Date.now(), url, addedAt: Date.now() });
    this.saveLinks(links);
    input.value = '';
    this.renderMyLinks();
  },

  deleteLink(id) {
    this.saveLinks(this.getLinks().filter(l => l.id !== id));
    this.renderMyLinks();
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
      <div class="todo-link-item todo-link-saved" data-id="${link.id}">
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
    const latestDate = Briefing.dates && Briefing.dates[0];
    if (latestDate && latestDate !== this.briefingDate) {
      this.loadBriefingContent();
    } else {
      this.renderBriefingActions();
      this.renderFurtherReading();
    }
  },
};
