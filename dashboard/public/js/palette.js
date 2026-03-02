/**
 * Palette — Ctrl+K command palette. Searches across feeds, briefing headings, and events.
 */
const Palette = {
  visible: false,
  results: [],
  activeIndex: -1,
  _headingEls: [],

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
          <input id="palette-input" type="text" placeholder="Search feeds, briefing, events..." autocomplete="off" spellcheck="false"/>
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
      timer = setTimeout(() => this.search(input.value), 100);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.navigate(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.navigate(-1); }
      if (e.key === 'Enter') { e.preventDefault(); this.executeActive(); }
    });
  },

  open() {
    this.visible = true;
    document.getElementById('palette-overlay').classList.remove('hidden');
    const input = document.getElementById('palette-input');
    input.value = '';
    input.focus();
    this.search('');
  },

  close() {
    this.visible = false;
    document.getElementById('palette-overlay').classList.add('hidden');
    this.activeIndex = -1;
  },

  search(query) {
    const q = query.toLowerCase().trim();
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

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  },
};
