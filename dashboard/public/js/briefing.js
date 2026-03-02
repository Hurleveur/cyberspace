/**
 * Briefing panel — renders daily briefing markdown with collapsible sections,
 * interactive checkboxes, date navigation, and in-content search.
 */
const Briefing = {
  dates: [],
  currentIndex: 0,
  checkboxStates: {},
  markersData: [],

  // Search state
  searchVisible: false,
  searchMatches: [],
  searchIndex: -1,

  // Cross-report search state
  crossSearchActive: false,
  crossSearchTimer: null,

  async init() {
    this.bindEvents();
    await this.loadDates();
    if (this.dates.length > 0) {
      await this.loadBriefing(this.dates[0]);
    } else {
      document.getElementById('briefing-content').innerHTML =
        '<div class="empty-state">No briefings yet.<br>Run the intelligence system to generate your first report.</div>';
      document.getElementById('briefing-date').textContent = 'No reports';
    }
  },

  bindEvents() {
    document.getElementById('briefing-prev').addEventListener('click', () => this.navigate(1));
    document.getElementById('briefing-next').addEventListener('click', () => this.navigate(-1));

    // Search events
    const searchInput = document.getElementById('briefing-search-input');
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => this.performSearch(searchInput.value), 200);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.navigateMatch(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { e.preventDefault(); this.toggleSearch(false); }
    });
    document.getElementById('briefing-search-prev').addEventListener('click', () => this.navigateMatch(-1));
    document.getElementById('briefing-search-next').addEventListener('click', () => this.navigateMatch(1));
    document.getElementById('briefing-search-close').addEventListener('click', () => this.toggleSearch(false));

    const crossBtn = document.getElementById('briefing-search-cross-btn');
    if (crossBtn) crossBtn.addEventListener('click', () => this.toggleCrossSearch());
  },

  toggleSearch(forceState) {
    this.searchVisible = forceState !== undefined ? forceState : !this.searchVisible;
    const bar = document.getElementById('briefing-search-bar');
    bar.classList.toggle('hidden', !this.searchVisible);
    if (this.searchVisible) {
      document.getElementById('briefing-search-input').focus();
    } else {
      this.clearSearch();
      // Reset cross-search if it was active
      if (this.crossSearchActive) {
        this.crossSearchActive = false;
        const crossBtn = document.getElementById('briefing-search-cross-btn');
        if (crossBtn) crossBtn.classList.remove('active');
        this.loadBriefing(this.dates[this.currentIndex]);
      }
    }
  },

  toggleCrossSearch() {
    this.crossSearchActive = !this.crossSearchActive;
    const crossBtn = document.getElementById('briefing-search-cross-btn');
    if (crossBtn) crossBtn.classList.toggle('active', this.crossSearchActive);

    if (!this.crossSearchActive) {
      // Deactivating — reload current briefing and clear cross results
      this.loadBriefing(this.dates[this.currentIndex]);
      document.getElementById('briefing-search-count').textContent = '';
    } else {
      // Activating — run search with current query if any
      const query = document.getElementById('briefing-search-input').value.trim();
      if (query.length >= 2) this.performCrossSearch(query);
    }
  },

  performSearch(query) {
    // If cross-search mode is active, delegate
    if (this.crossSearchActive) {
      this.performCrossSearch(query);
      return;
    }
    this.clearSearchHighlights();
    this.searchMatches = [];
    this.searchIndex = -1;

    if (!query || query.length < 2) {
      document.getElementById('briefing-search-count').textContent = '';
      return;
    }

    const container = document.querySelector('#briefing-content .markdown-body');
    if (!container) return;

    // Walk text nodes and wrap matches
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const matchNodes = [];
    const lowerQuery = query.toLowerCase();

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent.toLowerCase().includes(lowerQuery)) {
        matchNodes.push(node);
      }
    }

    for (const node of matchNodes) {
      const text = node.textContent;
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      if (parts.length <= 1) continue;

      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (regex.test(part) || part.toLowerCase() === lowerQuery) {
          const mark = document.createElement('mark');
          mark.className = 'briefing-highlight';
          mark.textContent = part;
          frag.appendChild(mark);
          this.searchMatches.push(mark);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
        regex.lastIndex = 0;
      }
      node.parentNode.replaceChild(frag, node);
    }

    // Auto-expand collapsed sections containing matches
    for (const mark of this.searchMatches) {
      const section = mark.closest('.briefing-section');
      if (section && !section.classList.contains('expanded')) {
        section.classList.add('expanded');
        const h2 = section.previousElementSibling;
        if (h2?.tagName === 'H2') h2.classList.add('expanded');
      }
    }

    const count = this.searchMatches.length;
    document.getElementById('briefing-search-count').textContent = count > 0 ? `${count} found` : 'no results';

    if (count > 0) this.navigateMatch(1);
  },

  performCrossSearch(query) {
    clearTimeout(this.crossSearchTimer);
    if (!query || query.length < 2) {
      document.getElementById('briefing-search-count').textContent = '';
      return;
    }
    this.crossSearchTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('Search failed');
        const results = await res.json();
        this.renderCrossResults(results, query);
      } catch (err) {
        console.error('[briefing] Cross-search error:', err);
      }
    }, 300);
  },

  renderCrossResults(results, query) {
    const container = document.getElementById('briefing-content');
    const totalDates = this.dates.length;

    if (results.length === 0) {
      container.innerHTML = `<div class="empty-state">No matches found across ${totalDates} report${totalDates !== 1 ? 's' : ''}.</div>`;
      document.getElementById('briefing-search-count').textContent = '0 found';
      return;
    }

    document.getElementById('briefing-search-count').textContent = `${results.length} found`;

    // Group by date
    const byDate = new Map();
    for (const r of results) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    }

    const lq = query.toLowerCase();
    const escHtml = (s) => {
      const d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    };
    const highlight = (text) => {
      const esc = escHtml(text);
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return esc.replace(regex, '<mark>$1</mark>');
    };

    let html = '';
    for (const [date, items] of byDate) {
      html += `<div class="cross-results-date-header" data-date="${date}">${date} (${items.length} match${items.length !== 1 ? 'es' : ''})</div>`;
      for (const item of items) {
        html += `<div class="cross-result-item" data-date="${date}" data-line="${item.lineNum}">
          ${item.section ? `<div class="cross-result-section">${escHtml(item.section)}</div>` : ''}
          <div class="cross-result-context">${highlight(item.context)}</div>
        </div>`;
      }
    }

    container.innerHTML = html;

    // Bind click: load that date's briefing and highlight the query
    container.querySelectorAll('.cross-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.dataset.date;
        const dateIdx = this.dates.indexOf(date);
        if (dateIdx !== -1) this.currentIndex = dateIdx;
        this.updateNav();

        // Exit cross-search mode, load briefing, then search locally
        this.crossSearchActive = false;
        const crossBtn = document.getElementById('briefing-search-cross-btn');
        if (crossBtn) crossBtn.classList.remove('active');

        this.loadBriefing(date).then(() => {
          const q = document.getElementById('briefing-search-input').value.trim();
          if (q.length >= 2) this.performSearch(q);
        });
      });
    });
  },

  navigateMatch(direction) {
    if (this.searchMatches.length === 0) return;

    // Remove active from current
    if (this.searchIndex >= 0 && this.searchIndex < this.searchMatches.length) {
      this.searchMatches[this.searchIndex].classList.remove('briefing-highlight-active');
    }

    this.searchIndex += direction;
    if (this.searchIndex >= this.searchMatches.length) this.searchIndex = 0;
    if (this.searchIndex < 0) this.searchIndex = this.searchMatches.length - 1;

    const current = this.searchMatches[this.searchIndex];
    current.classList.add('briefing-highlight-active');
    current.scrollIntoView({ behavior: 'smooth', block: 'center' });

    document.getElementById('briefing-search-count').textContent =
      `${this.searchIndex + 1}/${this.searchMatches.length}`;
  },

  clearSearch() {
    this.clearSearchHighlights();
    this.searchMatches = [];
    this.searchIndex = -1;
    document.getElementById('briefing-search-input').value = '';
    document.getElementById('briefing-search-count').textContent = '';
  },

  clearSearchHighlights() {
    const container = document.querySelector('#briefing-content .markdown-body');
    if (!container) return;
    const marks = container.querySelectorAll('mark.briefing-highlight');
    marks.forEach(mark => {
      const text = document.createTextNode(mark.textContent);
      mark.parentNode.replaceChild(text, mark);
    });
    // Merge adjacent text nodes
    container.normalize();
  },

  setMarkers(markers) {
    this.markersData = markers || [];
  },

  scrollToMarker(markerId) {
    const container = document.querySelector('#briefing-content .markdown-body');
    if (!container) return;

    const marker = this.markersData.find(m => m.id === markerId);
    if (!marker) return;

    const headings = [...container.querySelectorAll('h2, h3')];

    // Try exact title match first (individual story heading)
    for (const h of headings) {
      if (h.textContent.toLowerCase().includes(marker.title.toLowerCase().slice(0, 20))) {
        this._flashHeading(h);
        return;
      }
    }

    // Fall back: scroll to the matching section by category
    const categoryMap = {
      'active-threats': ['active threats', 'critical'],
      'vulnerability-intel': ['vulnerability'],
      'breaches': ['breaches'],
      'threat-actors': ['threat actors'],
      'ai-security': ['ai'],
      'policy': ['policy'],
      'tools': ['tools'],
    };
    const keywords = marker.priority === 'critical'
      ? ['critical', ...(categoryMap[marker.category] || [])]
      : (categoryMap[marker.category] || []);

    for (const kw of keywords) {
      const h = headings.find(h => h.textContent.toLowerCase().includes(kw));
      if (h) { this._flashHeading(h); return; }
    }
  },

  _flashHeading(h) {
    const section = h.nextElementSibling;
    if (section?.classList.contains('briefing-section') && !section.classList.contains('expanded')) {
      section.classList.add('expanded');
      if (h.tagName === 'H2') h.classList.add('expanded');
    }
    h.scrollIntoView({ behavior: 'smooth', block: 'center' });
    h.classList.add('highlight-flash');
    setTimeout(() => h.classList.remove('highlight-flash'), 1500);
  },

  async loadDates() {
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) return;
      const data = await res.json();
      this.dates = data.dates || [];
    } catch {
      this.dates = [];
    }
    this.updateNav();
  },

  async loadBriefing(date) {
    const container = document.getElementById('briefing-content');
    document.getElementById('briefing-date').textContent = date;

    try {
      const res = await fetch(`/api/file?path=reports/${date}/briefing.md`);
      if (!res.ok) {
        container.innerHTML = `<div class="empty-state">No briefing for ${date}</div>`;
        return;
      }
      const markdown = await res.text();
      this.renderMarkdown(container, markdown, date);
      this.extractThreatLevel(markdown);
      this.extractStreak(markdown);

      ReadTracker.markRead(`briefing-${date}`);
      App.updateUnreadCount();
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Error loading briefing: ${err.message}</div>`;
    }
  },

  renderMarkdown(container, markdown, date) {
    marked.setOptions({ breaks: true, gfm: true });
    let html = marked.parse(markdown);
    container.innerHTML = `<div class="markdown-body">${html}</div>`;
    this.makeCollapsible(container);
    this.bindCheckboxes(container, date);
  },

  makeCollapsible(container) {
    const headings = container.querySelectorAll('.markdown-body h2');
    headings.forEach(h2 => {
      const section = document.createElement('div');
      section.className = 'briefing-section expanded';
      h2.classList.add('expanded');

      let el = h2.nextElementSibling;
      const elements = [];
      while (el && el.tagName !== 'H2' && !(el.tagName === 'HR' && el.nextElementSibling?.tagName === 'H2')) {
        elements.push(el);
        el = el.nextElementSibling;
      }

      if (elements.length > 0) {
        h2.after(section);
        for (const e of elements) {
          section.appendChild(e);
        }
      }

      h2.addEventListener('click', () => {
        const expanded = h2.classList.toggle('expanded');
        section.classList.toggle('expanded', expanded);
      });
    });
  },

  bindCheckboxes(container, date) {
    const key = `checkboxes-${date}`;
    this.checkboxStates = JSON.parse(localStorage.getItem(key) || '{}');

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb, i) => {
      if (this.checkboxStates[i]) cb.checked = true;
      cb.addEventListener('change', () => {
        this.checkboxStates[i] = cb.checked;
        localStorage.setItem(key, JSON.stringify(this.checkboxStates));
      });
    });
  },

  extractThreatLevel(markdown) {
    const badge = document.getElementById('threat-badge');
    const label = document.getElementById('threat-label');

    const match = markdown.match(/(?:threat level|Overall threat level)[:\s]*([🟢🟡🟠🔴])\s*(\w+)/i)
      || markdown.match(/(🟢|🟡|🟠|🔴)\s*(LOW|GUARDED|ELEVATED|HIGH|SEVERE|CRITICAL)/i);

    if (match) {
      const emoji = match[1];
      const level = match[2].toUpperCase();
      label.textContent = level;

      badge.className = 'threat-badge';
      if (emoji === '🔴' || level === 'CRITICAL' || level === 'SEVERE') badge.classList.add('threat-critical');
      else if (emoji === '🟠' || level === 'HIGH') badge.classList.add('threat-high');
      else if (emoji === '🟡' || level === 'ELEVATED' || level === 'MEDIUM') badge.classList.add('threat-medium');
      else badge.classList.add('threat-low');
    }
  },

  extractStreak(markdown) {
    const match = markdown.match(/Briefing #(\d+)/);
    if (match) {
      document.getElementById('streak-badge').textContent = `Briefing #${match[1]}`;
    }
  },

  getUnreadCount() {
    if (this.dates.length === 0) return 0;
    return ReadTracker.isRead(`briefing-${this.dates[0]}`) ? 0 : 1;
  },

  navigate(direction) {
    const newIndex = this.currentIndex + direction;
    if (newIndex < 0 || newIndex >= this.dates.length) return;
    this.currentIndex = newIndex;
    this.loadBriefing(this.dates[this.currentIndex]);
    this.updateNav();
  },

  updateNav() {
    document.getElementById('briefing-prev').disabled = this.currentIndex >= this.dates.length - 1;
    document.getElementById('briefing-next').disabled = this.currentIndex <= 0;
  },

  async refresh() {
    await this.loadDates();
    if (this.dates.length > 0) {
      this.currentIndex = 0;
      await this.loadBriefing(this.dates[0]);
    }
  },
};
