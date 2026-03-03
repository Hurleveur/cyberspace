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
      `opacity:${this._enabled ? 0.045 : 0}`,
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
    this.canvas.style.opacity = '0.10';
    setTimeout(() => { this.canvas.style.opacity = '0.045'; }, duration);
  },

  enable() {
    this._enabled = true;
    localStorage.setItem('cyberspace-matrix', 'on');
    this.canvas.style.opacity = '0.045';
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
