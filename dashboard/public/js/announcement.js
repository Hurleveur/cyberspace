/**
 * Announcement — intercepts transmissions found in reports/YYYY-MM-DD/announcement.md.
 * Shows as a dismissable alert bar; clicking it opens the full transmission overlay.
 * Dismissal is persisted per date in localStorage.
 */
const Announcement = {
  STORAGE_KEY: 'cyberspace-announcements-seen',
  _date: null,
  _meta: null,
  _body: null,
  _typing: false,
  _typeTimeout: null,
  _escHandler: null,

  async init() {
    try {
      const resp = await fetch('/api/reports/announcement');
      if (!resp.ok) return;
      const { date, content } = await resp.json();

      if (this._getSeen().includes(date)) return;

      const { meta, body } = this._parseFrontmatter(content);
      this._date = date;
      this._meta = meta;
      this._body = body;
      this._showHeaderIcon();
    } catch (_) {
      // Announcements are optional — fail silently
    }
  },

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

    inner.addEventListener('click', () => this._openOverlay());
    dismissBtn.addEventListener('click', (e) => {
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
    // Don't mark as seen — show header icon so it's still accessible
    this._showHeaderIcon();
  },

  // ── Overlay ───────────────────────────────────────────────────────────────────

  _openOverlay() {
    const overlay  = document.getElementById('announcement-overlay');
    const titleEl  = document.getElementById('announcement-title');
    const dateEl   = document.getElementById('announcement-date');
    const authorEl = document.getElementById('announcement-author');
    const textEl   = document.getElementById('announcement-text');

    titleEl.textContent  = this._meta.title;
    dateEl.textContent   = `DATE: ${this._meta.date || this._date}`;
    authorEl.textContent = `AUTHOR: ${this._meta.author.toUpperCase()}`;
    textEl.textContent   = '';

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

    const oldSkip   = document.getElementById('announcement-skip');
    const freshSkip = oldSkip.cloneNode(true);
    oldSkip.replaceWith(freshSkip);
    freshSkip.addEventListener('click', () => this._skipTypewriter(textEl));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeOverlay();
    }, { once: true });

    this._escHandler = (e) => { if (e.key === 'Escape') this._closeOverlay(); };
    document.addEventListener('keydown', this._escHandler);

    // Scroll hint: update on body scroll
    const bodyEl = overlay.querySelector('.announcement-body');
    const hint   = document.getElementById('announcement-scroll-hint');
    if (hint) hint.classList.add('hidden');
    this._scrollHandler = () => this._updateScrollHint(bodyEl);
    bodyEl.addEventListener('scroll', this._scrollHandler);

    this._startTypewriter(textEl, this._body);
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
    this._markSeen(this._date);
    if (typeof LevelSystem !== 'undefined') LevelSystem.reward('intercept', this._date);
    this._hideHeaderIcon();
    this._closeOverlay();
  },

  // ── Header icon ───────────────────────────────────────────────────────────────

  _showHeaderIcon() {
    const btn = document.getElementById('intercept-btn');
    if (!btn) return;
    btn.classList.remove('hidden');
    btn.title = `Intercepted transmission: ${this._meta?.title || 'TRANSMISSION'} — click to read`;
    btn.onclick = () => this._openOverlay();
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

    const step = () => {
      if (!this._typing) return;
      if (i < body.length) {
        textNode.appendData(body[i++]);
        container.scrollTop = container.scrollHeight;
        this._typeTimeout = setTimeout(step, delay);
      } else {
        cursor.remove();
        this._typing = false;
        this._showSkip(false);
        // Typewriter landed at bottom — hint hidden; user can scroll up and back down
        const bodyEl = document.querySelector('.announcement-body');
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
      this._updateScrollHint(bodyEl);
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

  _markSeen(date) {
    const seen = this._getSeen();
    if (seen.includes(date)) return;
    seen.push(date);
    if (seen.length > 30) seen.shift();
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(seen)); } catch (_) {}
  },

  _getSeen() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
    } catch (_) {
      return [];
    }
  },
};
