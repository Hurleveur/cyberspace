/**
 * MatrixRain — subtle canvas-based Matrix rain effect.
 * Rendered as a full-page overlay with pointer-events: none.
 * Intensity increases briefly on 🔴 CRITICAL threat events.
 */
const MatrixRain = {
  canvas: null,
  ctx: null,
  drops: [],
  _animId: null,
  _enabled: true,

  // Katakana + a handful of latin/digits for variety
  chars: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF',

  init() {
    this._enabled = localStorage.getItem('cyberspace-matrix') !== 'off';
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'matrix-rain';
    this.canvas.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      `z-index:${this._enabled ? 2 : -1}`,
      `opacity:${this._enabled ? 0.07 : 0}`,
      'transition:opacity 1s',
    ].join(';');
    document.body.insertBefore(this.canvas, document.body.firstChild);

    this._resize();
    window.addEventListener('resize', () => this._resize());

    if (this._enabled) this._startLoop();
  },

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    const cols = Math.floor(this.canvas.width / 14);
    // Spread drops randomly so they don't all start at top on resize
    this.drops = Array.from({ length: cols }, () =>
      Math.floor(Math.random() * (this.canvas.height / 14))
    );
  },

  _startLoop() {
    if (this._animId) return;
    const tick = () => {
      this._draw();
      this._animId = requestAnimationFrame(tick);
    };
    this._animId = requestAnimationFrame(tick);
  },

  _stopLoop() {
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
  },

  _draw() {
    const ctx = this.canvas.getContext('2d');
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#00ff41';

    // Fade trail
    ctx.fillStyle = 'rgba(10,10,10,0.04)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = accent;
    ctx.font = '12px monospace';

    for (let i = 0; i < this.drops.length; i++) {
      const char = this.chars[Math.floor(Math.random() * this.chars.length)];
      ctx.fillText(char, i * 14, this.drops[i] * 14);
      if (this.drops[i] * 14 > this.canvas.height && Math.random() > 0.975) {
        this.drops[i] = 0;
      }
      this.drops[i]++;
    }
  },

  /** Briefly increase intensity (called on CRITICAL threat level). */
  intensify(duration = 6000) {
    if (!this._enabled) return;
    clearTimeout(this._intensifyTimeout);
    this.canvas.style.opacity = '0.14';
    this._intensifyTimeout = setTimeout(() => {
      this.canvas.style.opacity = '0.07';
      this._intensifyTimeout = null;
    }, duration);
  },

  enable() {
    this._enabled = true;
    localStorage.setItem('cyberspace-matrix', 'on');
    this.canvas.style.opacity = '0.07';
    this.canvas.style.zIndex = '2';
    this._startLoop();
  },

  disable() {
    this._enabled = false;
    localStorage.setItem('cyberspace-matrix', 'off');
    this.canvas.style.opacity = '0';
    this.canvas.style.zIndex = '-1';
    this._stopLoop();
  },

  toggle() {
    this._enabled ? this.disable() : this.enable();
    return this._enabled;
  },
};

/**
 * VisualFX — Phase 4 visual effects controller.
 * Manages CRT scanlines, vignette, glitch triggers, and animations.
 */
const VisualFX = {
  CRT_KEY: 'cyberspace-crt',
  VIGNETTE_KEY: 'cyberspace-vignette',

  crtEnabled: true,
  vignetteEnabled: true,

  init() {
    // Restore CRT preference
    this.crtEnabled = localStorage.getItem(this.CRT_KEY) !== 'off';
    if (this.crtEnabled) document.body.classList.add('crt-on');

    // Restore vignette preference
    this.vignetteEnabled = localStorage.getItem(this.VIGNETTE_KEY) !== 'off';
    if (this.vignetteEnabled) document.body.classList.add('vignette');

    // Apply glitch-hover data-text attributes to headings
    this._applyGlitchHover();
  },

  // ── CRT scanlines ────────────────────────────────────────────────

  toggleCRT() {
    this.crtEnabled = !this.crtEnabled;
    document.body.classList.toggle('crt-on', this.crtEnabled);
    localStorage.setItem(this.CRT_KEY, this.crtEnabled ? 'on' : 'off');
    return this.crtEnabled;
  },

  // ── Vignette ─────────────────────────────────────────────────────

  toggleVignette() {
    this.vignetteEnabled = !this.vignetteEnabled;
    document.body.classList.toggle('vignette', this.vignetteEnabled);
    localStorage.setItem(this.VIGNETTE_KEY, this.vignetteEnabled ? 'on' : 'off');
    return this.vignetteEnabled;
  },

  // ── Glitch hover on major headings ───────────────────────────────

  _applyGlitchHover() {
    // Panel headers
    document.querySelectorAll('.panel-header h2').forEach(el => {
      if (!el.classList.contains('glitch-hover')) {
        el.classList.add('glitch-hover');
        el.setAttribute('data-text', el.textContent);
      }
    });
    // Threat label already has glitch via CSS — add data-text
    const threat = document.getElementById('threat-label');
    if (threat) threat.setAttribute('data-text', threat.textContent || 'LOADING');
  },

  // ── Triggered glitch (one-shot) ──────────────────────────────────

  /**
   * Apply a brief glitch animation to an element.
   * @param {HTMLElement|string} target — element or CSS selector
   */
  glitch(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.classList.remove('glitch-trigger');
    void el.offsetWidth; // force reflow
    el.classList.add('glitch-trigger');
    el.addEventListener('animationend', () => el.classList.remove('glitch-trigger'), { once: true });
  },

  // ── Panel border glitch on open ──────────────────────────────────

  /**
   * Apply border-glitch to a panel when it opens.
   * @param {string} panelId — e.g. 'left-panel'
   */
  panelGlitch(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.remove('panel-glitch-border');
    void panel.offsetWidth;
    panel.classList.add('panel-glitch-border');
    panel.addEventListener('animationend', () => panel.classList.remove('panel-glitch-border'), { once: true });
  },

  // ── Data-received visual flash ───────────────────────────────────

  /**
   * Flash a panel to indicate new data arrived.
   * @param {string} panelId
   */
  dataFlash(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.remove('data-flash');
    void panel.offsetWidth;
    panel.classList.add('data-flash');
    panel.addEventListener('animationend', () => panel.classList.remove('data-flash'), { once: true });
  },

  // ── Button notification pulse ────────────────────────────────────

  /**
   * Pulse a header button to draw attention.
   * @param {string} btnId
   */
  notifyButton(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.remove('btn-notify-pulse');
    void btn.offsetWidth;
    btn.classList.add('btn-notify-pulse');
    btn.addEventListener('animationend', () => btn.classList.remove('btn-notify-pulse'), { once: true });
  },

  // ── Staggered item animations ────────────────────────────────────

  /**
   * Add staggered slide-in animation to list items.
   * @param {NodeList|HTMLElement[]} items
   * @param {string} animClass — e.g. 'feed-anim-in' or 'event-anim-in'
   */
  staggerItems(items, animClass = 'feed-anim-in') {
    Array.from(items).forEach((el, i) => {
      el.classList.add(animClass);
      el.style.animationDelay = `${i * 0.03}s`;
    });
  },

  // ── Typewriter effect for briefing title ─────────────────────────

  /**
   * Apply typewriter animation to the briefing h1 on first render.
   * @param {HTMLElement} el
   */
  typewriterHeading(el) {
    if (!el) return;
    el.classList.add('typewriter-heading');
    el.addEventListener('animationend', () => {
      el.classList.remove('typewriter-heading');
      el.style.borderRight = 'none';
    }, { once: true });
  },

  // ── Profiler progress bar reset ──────────────────────────────────

  resetProfilerProgress() {
    const bar = document.querySelector('.profiler-progress');
    if (!bar) return;
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = '';
  },
};
