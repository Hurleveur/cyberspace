/**
 * Feeds panel — fetches RSS feed items from the server and renders them.
 * Single-click expands inline preview, double-click opens externally.
 */
const Feeds = {
  items: [],
  filteredItems: [],
  categories: new Set(),
  expandedId: null,
  focusIndex: -1,

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

    const groups = this.groupByTime(this.filteredItems);
    let html = '';
    let idx = 0;

    for (const [label, items] of groups) {
      if (items.length === 0) continue;
      html += `<div class="feed-group-header">${label}</div>`;
      for (const item of items) {
        const isRead = ReadTracker.isRead(item.id);
        const isExpanded = this.expandedId === item.id;
        html += this.renderItem(item, isRead, isExpanded, idx);
        idx++;
      }
    }

    container.innerHTML = html;

    // Bind click handlers — single click to expand preview
    container.querySelectorAll('.feed-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        this.togglePreview(id);
      });
      el.addEventListener('dblclick', () => {
        const id = el.dataset.id;
        const item = this.items.find(i => i.id === id);
        if (item?.url) {
          ReadTracker.markRead(id);
          App.updateUnreadCount();
          window.open(item.url, '_blank');
        }
      });
    });

    // Bind "Open source" links
    container.querySelectorAll('.feed-open-btn').forEach(a => {
      a.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = a.dataset.id;
        ReadTracker.markRead(id);
        App.updateUnreadCount();
        const el = container.querySelector(`.feed-item[data-id="${id}"]`);
        if (el) el.classList.add('read');
      });
    });

    // Bind "Read" buttons → open inline article reader
    container.querySelectorAll('.feed-read-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = this.items.find(i => i.id === id);
        if (item?.url && typeof Reader !== 'undefined') {
          Reader.openReader(item.url, item.title);
        }
      });
    });

    this.updateBadge();
  },

  renderItem(item, isRead, isExpanded, idx) {
    const timeAgo = this.timeAgo(item.published);
    const summary = item.summary || item.description || 'No preview available.';
    // Truncate summary to ~200 chars
    const truncated = summary.length > 200 ? summary.slice(0, 200) + '...' : summary;

    return `
      <div class="feed-item ${isRead ? 'read' : ''} ${isExpanded ? 'feed-item-expanded' : ''}" data-id="${item.id}" data-idx="${idx}">
        <div class="feed-priority-dot ${item.priority}"></div>
        <div class="feed-item-body">
          <div class="feed-item-title">${this.escapeHtml(item.title)}</div>
          <div class="feed-item-meta">
            <span class="feed-item-source">${this.escapeHtml(item.source)}</span>
            <span>${timeAgo}</span>
          </div>
        </div>
      </div>
      <div class="feed-preview ${isExpanded ? 'active' : ''}" id="preview-${item.id}">
        <div class="feed-preview-text">${this.escapeHtml(truncated)}</div>
        <div class="feed-preview-actions">
          <a href="${this.escapeHtml(item.url)}" target="_blank" class="feed-open-btn" data-id="${item.id}">Open source ↗</a>
          <button class="feed-read-btn" data-id="${item.id}" title="Read article inline">Read ↓</button>
        </div>
      </div>
    `;
  },

  togglePreview(id) {
    const wasExpanded = this.expandedId === id;
    this.expandedId = wasExpanded ? null : id;

    // Mark as read when expanding
    if (!wasExpanded) {
      ReadTracker.markRead(id);
      App.updateUnreadCount();
      const el = document.querySelector(`.feed-item[data-id="${id}"]`);
      if (el) el.classList.add('read');
    }

    // Toggle all previews
    document.querySelectorAll('.feed-preview').forEach(el => {
      el.classList.toggle('active', el.id === `preview-${this.expandedId}`);
    });
    document.querySelectorAll('.feed-item').forEach(el => {
      el.classList.toggle('feed-item-expanded', el.dataset.id === this.expandedId);
    });

    this.updateBadge();
  },

  scrollToItem(itemId) {
    const el = document.querySelector(`.feed-item[data-id="${itemId}"]`);
    if (el) {
      this.togglePreview(itemId);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-flash');
    }
  },

  // Keyboard navigation
  handleKeyNav(e) {
    const items = document.querySelectorAll('.feed-item');
    if (items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.focusFeedItem(items, this.focusIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.focusFeedItem(items, this.focusIndex - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (this.focusIndex >= 0 && this.focusIndex < items.length) {
          const id = items[this.focusIndex].dataset.id;
          if (e.shiftKey) {
            const item = this.items.find(i => i.id === id);
            if (item?.url) {
              ReadTracker.markRead(id);
              App.updateUnreadCount();
              window.open(item.url, '_blank');
            }
          } else {
            this.togglePreview(id);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        this.expandedId = null;
        this.focusIndex = -1;
        document.querySelectorAll('.feed-preview').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.feed-item').forEach(el => {
          el.classList.remove('feed-item-expanded', 'feed-item-focused');
        });
        break;
    }
  },

  focusFeedItem(items, newIndex) {
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= items.length) newIndex = items.length - 1;

    items.forEach(el => el.classList.remove('feed-item-focused'));
    this.focusIndex = newIndex;
    const target = items[newIndex];
    target.classList.add('feed-item-focused');
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
