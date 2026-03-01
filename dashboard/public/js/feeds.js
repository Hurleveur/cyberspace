/**
 * Feeds panel — fetches RSS feed items from the server and renders them.
 */
const Feeds = {
  items: [],
  filteredItems: [],
  categories: new Set(),

  async init() {
    this.bindEvents();
    await this.load();
  },

  bindEvents() {
    document.getElementById('feeds-filter-category').addEventListener('change', () => this.applyFilters());
    document.getElementById('feeds-filter-priority').addEventListener('change', () => this.applyFilters());
    document.getElementById('feeds-search').addEventListener('input', () => this.applyFilters());
    document.getElementById('feeds-refresh-btn').addEventListener('click', () => this.refresh());
  },

  async load() {
    try {
      const res = await fetch('/api/feeds');
      if (!res.ok) throw new Error('Failed to load feeds');
      const data = await res.json();
      this.items = data.items || [];
      this.buildCategories();
      this.applyFilters();
    } catch (err) {
      document.getElementById('feeds-list').innerHTML =
        `<div class="empty-state">Could not load feeds.<br>${err.message}</div>`;
    }
  },

  async refresh() {
    const btn = document.getElementById('feeds-refresh-btn');
    btn.textContent = '...';
    btn.disabled = true;
    try {
      const res = await fetch('/api/feeds/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('Refresh failed');
      const data = await res.json();
      this.items = data.items || [];
      this.buildCategories();
      this.applyFilters();
    } catch (err) {
      console.error('[feeds] Refresh error:', err);
    } finally {
      btn.textContent = '↻';
      btn.disabled = false;
    }
  },

  buildCategories() {
    this.categories.clear();
    for (const item of this.items) {
      if (item.category) this.categories.add(item.category);
    }
    const select = document.getElementById('feeds-filter-category');
    const current = select.value;
    select.innerHTML = '<option value="">All Categories</option>';
    for (const cat of this.categories) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    }
    select.value = current;
  },

  applyFilters() {
    const category = document.getElementById('feeds-filter-category').value;
    const priority = document.getElementById('feeds-filter-priority').value;
    const search = document.getElementById('feeds-search').value.toLowerCase().trim();

    this.filteredItems = this.items.filter(item => {
      if (category && item.category !== category) return false;
      if (priority && item.priority !== priority) return false;
      if (search && !item.title.toLowerCase().includes(search) &&
          !item.source.toLowerCase().includes(search)) return false;
      return true;
    });

    this.render();
  },

  render() {
    const container = document.getElementById('feeds-list');

    if (this.filteredItems.length === 0) {
      container.innerHTML = '<div class="empty-state">No feed items match your filters.</div>';
      this.updateBadge();
      return;
    }

    // Group by time
    const groups = this.groupByTime(this.filteredItems);
    let html = '';

    for (const [label, items] of groups) {
      if (items.length === 0) continue;
      html += `<div class="feed-group-header">${label}</div>`;
      for (const item of items) {
        const isRead = ReadTracker.isRead(item.id);
        html += this.renderItem(item, isRead);
      }
    }

    container.innerHTML = html;

    // Bind click handlers
    container.querySelectorAll('.feed-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const item = this.items.find(i => i.id === id);
        if (!item) return;
        ReadTracker.markRead(id);
        el.classList.add('read');
        App.updateUnreadCount();
        if (item.url) window.open(item.url, '_blank');
      });
    });

    this.updateBadge();
  },

  renderItem(item, isRead) {
    const timeAgo = this.timeAgo(item.published);
    return `
      <div class="feed-item ${isRead ? 'read' : ''}" data-id="${item.id}">
        <div class="feed-priority-dot ${item.priority}"></div>
        <div class="feed-item-body">
          <div class="feed-item-title">${this.escapeHtml(item.title)}</div>
          <div class="feed-item-meta">
            <span class="feed-item-source">${this.escapeHtml(item.source)}</span>
            <span>${timeAgo}</span>
          </div>
        </div>
      </div>
    `;
  },

  groupByTime(items) {
    const now = Date.now();
    const hourAgo = now - 3600000;
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart - 86400000;

    const groups = [
      ['Last Hour', []],
      ['Today', []],
      ['Yesterday', []],
      ['Older', []],
    ];

    for (const item of items) {
      const ts = new Date(item.published).getTime();
      if (ts > hourAgo) groups[0][1].push(item);
      else if (ts > todayStart) groups[1][1].push(item);
      else if (ts > yesterdayStart) groups[2][1].push(item);
      else groups[3][1].push(item);
    }

    return groups;
  },

  updateBadge() {
    const unread = this.items.filter(i => !ReadTracker.isRead(i.id)).length;
    const badge = document.getElementById('feeds-unread-badge');
    badge.textContent = unread;
    badge.classList.toggle('zero', unread === 0);
  },

  getUnreadCount() {
    return this.items.filter(i => !ReadTracker.isRead(i.id)).length;
  },

  timeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },
};
