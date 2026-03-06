/**
 * LevelSystem — optional gamification layer.
 *
 * XP rewards (each action is deduped by a string ID so re-renders never
 * award XP twice):
 *   feed   +10  reading / expanding a feed item
 *   action +20  completing a briefing action-item checkbox
 *   task   +15  completing a custom user task
 *   event  +50  accepting an event
 *
 * Level formula: cumulative threshold = 50·N·(N+1)
 *   → level 1 at 100 XP, level 2 at 300, level 3 at 600, …
 *   Each new level requires 100 more XP than the previous one.
 *
 * All state lives in localStorage under:
 *   cyberspace-leveling-enabled   "true" | "false"  (default: enabled)
 *   cyberspace-xp                 integer as string
 *   cyberspace-xp-rewarded        JSON object  { "feed:abc123": 1, … }
 *
 * On first enable (or page-load while enabled), retroactiveImport() scans
 * existing localStorage for already-read feeds, checked action items,
 * completed tasks, and accepted events, awarding XP in bulk (no per-item
 * toasts — just a summary). Dedup prevents double-counting across reloads.
 */
const LevelSystem = {
  // ─── localStorage keys ──────────────────────────────────────────────────

  ENABLED_KEY:  'cyberspace-leveling-enabled',
  XP_KEY:       'cyberspace-xp',
  REWARDED_KEY: 'cyberspace-xp-rewarded',

  // ─── XP per action type ─────────────────────────────────────────────────

  XP_VALUES: {
    feed:        10, // default / MEDIUM
    'feed:HIGH':  25,
    'feed:LOW':    5,
    action: 20,
    task:   15,
    event:  50,
    intercept: 100,
  },

  /** Resolve final XP amount, applying feed-priority scaling when available. */
  _resolveAmount(type, id) {
    if (type === 'feed' && typeof Feeds !== 'undefined' && Feeds.items) {
      const item = Feeds.items.find(i => i.id === id);
      const p = item?.priority?.toUpperCase();
      if (p === 'HIGH') return this.XP_VALUES['feed:HIGH'];
      if (p === 'LOW')  return this.XP_VALUES['feed:LOW'];
    }
    return this.XP_VALUES[type] || 0;
  },

  // ─── Tier titles ─────────────────────────────────────────────────────────

  TITLES: [
    [0,   'Lurker'],
    [1,   'Script Kiddie'],
    [3,   'Operator'],
    [5,   'Infiltrator'],
    [8,   'Analyst'],
    [11,  'Pen Tester'],
    [16,  'Red Teamer'],
    [21,  'Zero Day'],
  ],

  // ─── State accessors ─────────────────────────────────────────────────────

  isEnabled() {
    // Default ON — only disabled if explicitly set to "false"
    return localStorage.getItem(this.ENABLED_KEY) !== 'false';
  },

  toggle() {
    const next = !this.isEnabled();
    localStorage.setItem(this.ENABLED_KEY, next ? 'true' : 'false');
    if (next) this.retroactiveImport();
    this.renderWidget();
    return next;
  },

  getXP() {
    const parsed = parseInt(localStorage.getItem(this.XP_KEY), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  },

  setXP(xp) {
    localStorage.setItem(this.XP_KEY, String(xp));
  },

  getRewarded() {
    try { return JSON.parse(localStorage.getItem(this.REWARDED_KEY) || '{}'); }
    catch { return {}; }
  },

  // ─── Level math ──────────────────────────────────────────────────────────

  /**
   * Returns the level for a given cumulative XP total.
   * Inverse of: cumXP(N) = 50·N·(N+1)
   */
  getLevel(xp) {
    return Math.max(0, Math.floor((-1 + Math.sqrt(1 + 4 * xp / 50)) / 2));
  },

  /** XP needed to reach level N from 0. */
  xpForLevel(n) {
    return 50 * n * (n + 1);
  },

  /** Returns progress info for the current XP total. */
  getLevelProgress(xp) {
    const level = this.getLevel(xp);
    const xpStart  = this.xpForLevel(level);
    const xpNext   = this.xpForLevel(level + 1);
    const xpNeeded = xpNext - xpStart;
    const xpInLevel = xp - xpStart;
    const percent  = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));
    return { level, xpInLevel, xpNeeded, percent };
  },

  getTitle(level) {
    let title = this.TITLES[0][1];
    for (const [minLevel, name] of this.TITLES) {
      if (level >= minLevel) title = name;
    }
    return title;
  },

  // ─── Audio ─────────────────────────────────────────────────────────────────

  async _getAudioCtx() {
    if (!this._audioCtx || this._audioCtx.state === 'closed') {
      try {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch { return null; }
    }
    if (this._audioCtx.state === 'suspended') {
      try {
        await this._audioCtx.resume();
      } catch { return null; }
    }
    return this._audioCtx;
  },

  /** Short ascending chirp for XP gain. */
  async playXPSound() {
    const ctx = await this._getAudioCtx();
    if (!ctx) return;
    try {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  },

  /** Four-note ascending arpeggio for level-up. */
  async playLevelUpSound() {
    const ctx = await this._getAudioCtx();
    if (!ctx) return;
    try {
      [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]].forEach(([freq, delay]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.1, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.18);
      });
    } catch {}
  },

  // ─── Core reward logic ────────────────────────────────────────────────────

  /**
   * Award XP for an action. `type` is 'feed'|'action'|'task'|'event'.
   * `id` is a unique string for this specific interaction (used for dedup).
   */
  reward(type, id) {
    if (!this.isEnabled()) return;

    const key = `${type}:${id}`;
    const rewarded = this.getRewarded();
    if (rewarded[key]) return; // already awarded

    const amount = this._resolveAmount(type, id);
    if (!amount) return;

    const prevXP    = this.getXP();
    const prevLevel = this.getLevel(prevXP);
    const newXP     = prevXP + amount;
    const newLevel  = this.getLevel(newXP);

    // Persist
    rewarded[key] = 1;
    localStorage.setItem(this.REWARDED_KEY, JSON.stringify(rewarded));
    this.setXP(newXP);

    // Toast + sound
    this.playXPSound();
    if (typeof App !== 'undefined') {
      App.toast(`+${amount} XP`, 'xp');
    }

    // Level up?
    if (newLevel > prevLevel) {
      this.onLevelUp(newLevel);
    }

    this.renderWidget();
  },

  onLevelUp(level) {
    const title = this.getTitle(level);
    this.playLevelUpSound();
    if (typeof App !== 'undefined') {
      App.toast(`⬆ Level ${level} unlocked — ${title}`, 'levelup');
    }
  },

  // ─── Widget rendering ────────────────────────────────────────────────────

  renderWidget() {
    const widget = document.getElementById('level-widget');
    if (!widget) return;

    if (!this.isEnabled()) {
      widget.classList.add('hidden');
      return;
    }

    const xp = this.getXP();
    const { level, xpInLevel, xpNeeded, percent } = this.getLevelProgress(xp);
    const title = this.getTitle(level);

    const levelEl  = widget.querySelector('#level-number');
    const titleEl  = widget.querySelector('#level-title');
    const barFill  = widget.querySelector('#level-bar-fill');
    const xpLabel  = widget.querySelector('#level-xp-label');

    if (levelEl)  levelEl.textContent  = `LVL ${level}`;
    if (titleEl)  titleEl.textContent  = title;
    if (barFill)  barFill.style.width  = `${percent}%`;
    if (xpLabel)  xpLabel.textContent  = `${xpInLevel}/${xpNeeded}`;

    widget.title = `${title} · ${xp} total XP`;
    widget.classList.remove('hidden');
  },

  // ─── Retroactive import ───────────────────────────────────────────────────

  /**
   * Scan localStorage for past activity and award XP in bulk.
   * Already-rewarded IDs are skipped so this is safe to call on every load.
   * No per-item toasts — just a summary (and a level-up arp if applicable).
   */
  retroactiveImport() {
    if (!this.isEnabled()) return;

    const rewarded = this.getRewarded();
    let gained = 0;

    // Previously read feed items
    try {
      const reads = JSON.parse(localStorage.getItem('cyberspace-read-items') || '{}');
      for (const id of Object.keys(reads)) {
        const k = `feed:${id}`;
        if (!rewarded[k]) { rewarded[k] = 1; gained += this.XP_VALUES.feed; }
      }
    } catch {}

    // Completed briefing action checkboxes (keys: checkboxes-YYYY-MM-DD)
    const allKeys = [];
    for (let i = 0; i < localStorage.length; i++) allKeys.push(localStorage.key(i));

    for (const lsKey of allKeys) {
      if (!lsKey || !lsKey.startsWith('checkboxes-')) continue;
      const date = lsKey.slice('checkboxes-'.length);
      try {
        const checks = JSON.parse(localStorage.getItem(lsKey) || '{}');
        for (const [idx, val] of Object.entries(checks)) {
          if (!val) continue;
          const k = `action:${date}-${idx}`;
          if (!rewarded[k]) { rewarded[k] = 1; gained += this.XP_VALUES.action; }
        }
      } catch {}
    }

    // Completed custom tasks
    try {
      const tasks = JSON.parse(localStorage.getItem('cyberspace-todos') || '[]');
      for (const task of tasks) {
        if (!task.done) continue;
        const k = `task:${String(task.id)}`;
        if (!rewarded[k]) { rewarded[k] = 1; gained += this.XP_VALUES.task; }
      }
    } catch {}

    // Accepted events (event-accepted-<id> = "true")
    for (const lsKey of allKeys) {
      if (!lsKey || !lsKey.startsWith('event-accepted-')) continue;
      if (localStorage.getItem(lsKey) !== 'true') continue;
      const id = lsKey.slice('event-accepted-'.length);
      const k = `event:${id}`;
      if (!rewarded[k]) { rewarded[k] = 1; gained += this.XP_VALUES.event; }
    }

    if (gained === 0) return;

    const prevXP    = this.getXP();
    const prevLevel = this.getLevel(prevXP);
    const newXP     = prevXP + gained;
    const newLevel  = this.getLevel(newXP);

    localStorage.setItem(this.REWARDED_KEY, JSON.stringify(rewarded));
    this.setXP(newXP);

    if (typeof App !== 'undefined') {
      App.toast(`+${gained} XP from past activity`, 'xp');
      if (newLevel > prevLevel) {
        App.toast(`⬆ Level ${newLevel} — ${this.getTitle(newLevel)}`, 'levelup');
        this.playLevelUpSound();
      }
    }

    this.renderWidget();
  },

  // ─── Init ─────────────────────────────────────────────────────────────────

  init() {
    this.retroactiveImport();
    this.renderWidget();
  },
};
