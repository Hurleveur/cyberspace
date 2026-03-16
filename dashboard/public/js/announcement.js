/**
 * Announcement — intercepts transmissions found in reports/YYYY-MM-DD/announcement.md.
 * Loads ALL announcements from all report dates and keeps them accessible at all times.
 * Shows a dismissable alert bar for unseen transmissions; the header icon and overlay
 * remain available regardless of which briefing date is currently selected.
 */
const Announcement = {
  STORAGE_KEY: 'cyberspace-announcements-seen',

  // All announcements sorted oldest-first: [{ date, meta, body }, ...]
  _all: [],
  _currentIndex: 0,

  // Overlay state
  _typing: false,
  _typeTimeout: null,
  _escHandler: null,
  _scrollHandler: null,

  // Convenience getters for the currently-displayed announcement
  get _current() { return this._all[this._currentIndex] || null; },
  get _date() { return this._all[this._currentIndex]?.date || null; },
  get _meta()  { return this._all[this._currentIndex]?.meta  || null; },
  get _body()  { return this._all[this._currentIndex]?.body  || ''; },

  async init() {
    try {
      const resp = await fetch('/api/reports/announcements');
      if (!resp.ok) return;
      const { announcements } = await resp.json();

      this._all = (announcements || []).map(({ date, content }) => {
        const { meta, body } = this._parseFrontmatter(content);
        return {
          id: this._buildAnnouncementId(date, meta),
          date,
          meta,
          body,
        };
      });

      if (this._all.length === 0) return;

      // Always expose the header icon when there are any announcements
      this._showHeaderIcon();

      // Auto-pop the alert bar for the most recent unseen announcement (if any)
      const seen = this._getSeenSet();
      // Search newest-first for the first unseen one
      for (let i = this._all.length - 1; i >= 0; i--) {
        if (!this._isSeen(this._all[i], seen)) {
          this._currentIndex = i;
          this._showBar();
          break;
        }
      }
    } catch (_) {
      // Announcements are optional — fail silently
    }
  },

  // Called when switching briefing dates — announcements are global, so do nothing
  // (kept for API compatibility; the icon stays visible regardless)
  initForDate(_date) {},

  // ── Frontmatter ──────────────────────────────────────────────────────────────

  _parseFrontmatter(raw) {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
      return { meta: { title: 'TRANSMISSION', author: 'Anonymous', date: null }, body: raw.trim() };
    }
    const meta = { title: 'TRANSMISSION', author: 'Anonymous', date: null };
    for (const line of match[1].split('\n')) {
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      if (key === 'title')       meta.title  = val;
      else if (key === 'author') meta.author = val;
      else if (key === 'date')   meta.date   = val;
    }
    return { meta, body: match[2].trim() };
  },

  _buildAnnouncementId(date, meta) {
    const title  = String(meta?.title  || '').trim().toLowerCase();
    const author = String(meta?.author || '').trim().toLowerCase();
    const aDate  = String(meta?.date   || '').trim();
    return `${date}::${aDate}::${title}::${author}`;
  },

  _isSeen(announcement, seenSet) {
    if (!announcement) return true;
    // Backward compatibility: older entries were date-only strings.
    return seenSet.has(announcement.id) || seenSet.has(announcement.date);
  },

  // ── Alert Bar ─────────────────────────────────────────────────────────────────

  _showBar() {
    const bar        = document.getElementById('intercept-bar');
    const titleEl    = document.getElementById('intercept-bar-title');
    const authorEl   = document.getElementById('intercept-bar-author');
    const inner      = document.getElementById('intercept-bar-inner');
    const dismissBtn = document.getElementById('intercept-bar-dismiss');

    titleEl.textContent  = this._meta.title.toUpperCase();
    authorEl.textContent = this._meta.author.toUpperCase();

    document.body.classList.add('has-intercept-bar');
    bar.classList.remove('hidden');

    // Replace buttons to clear stale listeners
    const freshInner   = inner.cloneNode(true);   inner.replaceWith(freshInner);
    const freshDismiss = dismissBtn.cloneNode(true); dismissBtn.replaceWith(freshDismiss);

    freshInner.addEventListener('click', () => this._openOverlay());
    freshDismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      this._dismissBar();
    });
  },

  _dismissBar() {
    document.body.classList.remove('has-intercept-bar');
    const bar = document.getElementById('intercept-bar');
    bar.classList.add('intercept-bar-closing');
    setTimeout(() => {
      bar.classList.add('hidden');
      bar.classList.remove('intercept-bar-closing');
    }, 300);
    // Icon stays visible — user can still open the overlay
    this._showHeaderIcon();
  },

  // ── Overlay ───────────────────────────────────────────────────────────────────

  _renderOverlay() {
    const titleEl  = document.getElementById('announcement-title');
    const dateEl   = document.getElementById('announcement-date');
    const authorEl = document.getElementById('announcement-author');
    const textEl   = document.getElementById('announcement-text');
    const navEl    = document.getElementById('announcement-nav');

    titleEl.textContent  = this._meta.title;
    dateEl.textContent   = `DATE: ${this._meta.date || this._date}`;
    authorEl.textContent = `AUTHOR: ${this._meta.author.toUpperCase()}`;
    textEl.textContent   = '';

    // Update nav counter (shown only when there are multiple announcements)
    if (navEl) {
      if (this._all.length > 1) {
        const counter = navEl.querySelector('.announcement-nav-counter');
        const prevBtn = navEl.querySelector('.announcement-nav-prev');
        const nextBtn = navEl.querySelector('.announcement-nav-next');
        if (counter) counter.textContent = `TRANSMISSION ${this._currentIndex + 1} / ${this._all.length}`;
        if (prevBtn) prevBtn.disabled = this._currentIndex === 0;
        if (nextBtn) nextBtn.disabled = this._currentIndex === this._all.length - 1;
        navEl.classList.remove('hidden');
      } else {
        navEl.classList.add('hidden');
      }
    }

    // Scroll hint
    const hint = document.getElementById('announcement-scroll-hint');
    if (hint) hint.classList.add('hidden');

    this._startTypewriter(textEl, this._body);
  },

  _openOverlay() {
    // Default to latest unseen, or last if all seen
    if (this._all.length === 0) return;

    const overlay = document.getElementById('announcement-overlay');
    overlay.classList.remove('hidden', 'announcement-closing');

    // Replace buttons to clear stale listeners
    const oldClose = document.getElementById('announcement-close');
    const freshClose = oldClose.cloneNode(true);
    oldClose.replaceWith(freshClose);
    freshClose.addEventListener('click', () => this._closeOverlay());

    const oldDismiss = document.getElementById('announcement-dismiss');
    const freshDismiss = oldDismiss.cloneNode(true);
    oldDismiss.replaceWith(freshDismiss);
    freshDismiss.addEventListener('click', () => this._acknowledgeOverlay());

    const oldSkip = document.getElementById('announcement-skip');
    const freshSkip = oldSkip.cloneNode(true);
    oldSkip.replaceWith(freshSkip);
    freshSkip.addEventListener('click', () => {
      const textEl = document.getElementById('announcement-text');
      this._skipTypewriter(textEl);
    });

    // Nav prev/next
    const navEl = document.getElementById('announcement-nav');
    if (navEl) {
      const freshNav = navEl.cloneNode(true);
      navEl.replaceWith(freshNav);
      freshNav.querySelector('.announcement-nav-prev')?.addEventListener('click', () => this._navigateTo(this._currentIndex - 1));
      freshNav.querySelector('.announcement-nav-next')?.addEventListener('click', () => this._navigateTo(this._currentIndex + 1));
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeOverlay();
    }, { once: true });

    this._escHandler = (e) => { if (e.key === 'Escape') this._closeOverlay(); };
    document.addEventListener('keydown', this._escHandler);

    const bodyEl = overlay.querySelector('.announcement-body');
    this._scrollHandler = () => this._updateScrollHint(bodyEl);
    bodyEl.addEventListener('scroll', this._scrollHandler);

    this._renderOverlay();
  },

  _navigateTo(index) {
    if (index < 0 || index >= this._all.length) return;
    this._typing = false;
    clearTimeout(this._typeTimeout);
    this._currentIndex = index;

    // Re-bind nav since we cloned the element; just re-render
    const navEl = document.getElementById('announcement-nav');
    if (navEl) {
      const freshNav = navEl.cloneNode(true);
      navEl.replaceWith(freshNav);
      freshNav.querySelector('.announcement-nav-prev')?.addEventListener('click', () => this._navigateTo(this._currentIndex - 1));
      freshNav.querySelector('.announcement-nav-next')?.addEventListener('click', () => this._navigateTo(this._currentIndex + 1));
    }

    // Reset scroll hint
    const bodyEl = document.querySelector('.announcement-body');
    if (bodyEl) bodyEl.scrollTop = 0;

    this._renderOverlay();
  },

  _closeOverlay() {
    this._typing = false;
    clearTimeout(this._typeTimeout);
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    if (this._scrollHandler) {
      const bodyEl = document.querySelector('.announcement-body');
      if (bodyEl) bodyEl.removeEventListener('scroll', this._scrollHandler);
      this._scrollHandler = null;
    }
    const hint = document.getElementById('announcement-scroll-hint');
    if (hint) hint.classList.add('hidden');
    const overlay = document.getElementById('announcement-overlay');
    overlay.classList.add('announcement-closing');
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('announcement-closing');
    }, 400);
  },

  _acknowledgeOverlay() {
    this._markSeen(this._current);
    if (typeof LevelSystem !== 'undefined') LevelSystem.reward('intercept', this._date);
    // Recalculate: if all seen, hide icon; otherwise keep it
    const seen = this._getSeenSet();
    const anyUnseen = this._all.some(a => !this._isSeen(a, seen));
    if (!anyUnseen) this._hideHeaderIcon();
    this._closeOverlay();
  },

  // ── Header icon ───────────────────────────────────────────────────────────────

  _showHeaderIcon() {
    const btn = document.getElementById('intercept-btn');
    if (!btn) return;
    btn.classList.remove('hidden');
    const total  = this._all.length;
    const seen   = this._getSeenSet();
    const unseen = this._all.filter(a => !this._isSeen(a, seen)).length;
    btn.title = unseen > 0
      ? `${unseen} new transmission${unseen > 1 ? 's' : ''} — click to read`
      : `${total} transmission${total !== 1 ? 's' : ''} — click to review`;
    btn.onclick = () => {
      // Open to the first unseen, or last if all seen
      const firstUnseen = this._all.findIndex(a => !this._isSeen(a, this._getSeenSet()));
      this._currentIndex = firstUnseen >= 0 ? firstUnseen : this._all.length - 1;
      this._openOverlay();
    };
  },

  _hideHeaderIcon() {
    const btn = document.getElementById('intercept-btn');
    if (btn) btn.classList.add('hidden');
  },

  // ── Typewriter ────────────────────────────────────────────────────────────────

  _startTypewriter(container, body) {
    this._typing = true;
    container.innerHTML = '';
    container.style.whiteSpace = 'pre-wrap';

    const textNode = document.createTextNode('');
    const cursor   = document.createElement('span');
    cursor.className = 'announcement-cursor';
    container.appendChild(textNode);
    container.appendChild(cursor);

    // Adaptive speed: clamp between 8ms and 22ms per character
    const delay = Math.max(8, Math.min(22, Math.floor(3800 / body.length)));
    let i = 0;

    this._showSkip(true);

    const bodyEl = container.parentElement; // .announcement-body
    const step = () => {
      if (!this._typing) return;
      if (i < body.length) {
        textNode.appendData(body[i++]);
        // Check every 20 chars so hint appears as soon as the body fills up
        if (i % 20 === 0 && bodyEl) this._updateScrollHint(bodyEl);
        this._typeTimeout = setTimeout(step, delay);
      } else {
        cursor.remove();
        this._typing = false;
        this._showSkip(false);
        if (bodyEl) this._updateScrollHint(bodyEl);
      }
    };

    this._typeTimeout = setTimeout(step, 300);
  },

  _skipTypewriter(container) {
    this._typing = false;
    clearTimeout(this._typeTimeout);
    container.innerHTML = '';
    container.style.whiteSpace = 'pre-wrap';
    container.textContent = this._body;
    this._showSkip(false);
    // Scroll to top so user sees the start; hint will indicate there's more below
    const bodyEl = document.querySelector('.announcement-body');
    if (bodyEl) {
      bodyEl.scrollTop = 0;
      // Defer so the browser has computed the new scrollHeight before we check
      requestAnimationFrame(() => this._updateScrollHint(bodyEl));
    }
  },

  _showSkip(visible) {
    const skip = document.getElementById('announcement-skip');
    if (!skip) return;
    skip.classList.toggle('skip-hidden', !visible);
  },

  _updateScrollHint(bodyEl) {
    const hint = document.getElementById('announcement-scroll-hint');
    if (!hint || !bodyEl) return;
    const hasMore = bodyEl.scrollTop + bodyEl.clientHeight < bodyEl.scrollHeight - 20;
    hint.classList.toggle('hidden', !hasMore);
  },

  // ── Persistence ───────────────────────────────────────────────────────────────

  _markSeen(value) {
    const seen = this._getSeen();
    const keys = [];

    if (value && typeof value === 'object') {
      if (value.id) keys.push(value.id);
      if (value.date) keys.push(value.date);
    } else if (typeof value === 'string' && value) {
      keys.push(value);
    }

    if (keys.length === 0) return;

    const merged = [...new Set([...seen, ...keys])];
    if (merged.length > 60) merged.splice(0, merged.length - 60);
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged)); } catch (_) {}
  },

  _getSeenSet() {
    return new Set(this._getSeen());
  },

  _getSeen() {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  },
};
