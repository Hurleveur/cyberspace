/**
 * DataIO — export and import all user data.
 *
 * Exports a single JSON bundle containing:
 *   localStorage: tasks, links, bookmarks, read items, briefing checkbox states,
 *     hidden briefing actions / further reading, per-event accepted/skipped state,
 *     seen announcements, level/XP data
 *   server: projects (data/projects.json)
 *
 * Import modes:
 *   'merge'   — add records that don't already exist; leave current data intact (default)
 *   'replace' — clear all cyberspace data and restore from backup
 */
const DataIO = {
  FORMAT_VERSION: '1.0',

  // ─── Export ─────────────────────────────────────────────────────────────

  async export() {
    try {
      const ls     = this._gatherLocalStorage();
      const server = await this._fetchServerData();
      const bundle = {
        version:    this.FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        localStorage: ls,
        server,
      };
      const date = new Date().toISOString().slice(0, 10);
      this._download(`cyberspace-backup-${date}.json`, JSON.stringify(bundle, null, 2));
      return { ok: true, counts: this._countBundle(ls, server) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  _gatherLocalStorage() {
    const briefingCheckboxes    = {};
    const briefingActionsHidden = {};
    const briefingFurtherHidden = {};
    const eventAccepted         = {};
    const eventSkipped          = {};

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith('checkboxes-')) {
        try { briefingCheckboxes[key.slice('checkboxes-'.length)] = JSON.parse(localStorage.getItem(key)); } catch {}
      } else if (key.startsWith('briefing-actions-hidden-')) {
        try { briefingActionsHidden[key.slice('briefing-actions-hidden-'.length)] = JSON.parse(localStorage.getItem(key)); } catch {}
      } else if (key.startsWith('briefing-further-hidden-')) {
        try { briefingFurtherHidden[key.slice('briefing-further-hidden-'.length)] = JSON.parse(localStorage.getItem(key)); } catch {}
      } else if (key.startsWith('event-accepted-')) {
        eventAccepted[key.slice('event-accepted-'.length)] = localStorage.getItem(key);
      } else if (key.startsWith('event-skipped-')) {
        eventSkipped[key.slice('event-skipped-'.length)] = localStorage.getItem(key);
      }
    }

    return {
      tasks:             this._safeJson('cyberspace-todos', []),
      links:             this._safeJson('cyberspace-links', []),
      bookmarks:         this._safeJson('cyberspace-bookmarks', {}),
      readItems:         this._safeJson('cyberspace-read-items', {}),
      announcementsSeen: this._safeJson('cyberspace-announcements-seen', []),
      level: {
        enabled:  localStorage.getItem('cyberspace-leveling-enabled'),
        xp:       localStorage.getItem('cyberspace-xp'),
        rewarded: this._safeJson('cyberspace-xp-rewarded', {}),
      },
      briefingCheckboxes,
      briefingActionsHidden,
      briefingFurtherHidden,
      eventAccepted,
      eventSkipped,
    };
  },

  async _fetchServerData() {
    try {
      const res = await fetch('/api/data/export');
      if (!res.ok) return { projects: [] };
      return await res.json();
    } catch {
      return { projects: [] };
    }
  },

  _countBundle(ls, server) {
    return {
      tasks:         (ls.tasks || []).length,
      links:         (ls.links || []).length,
      bookmarks:     Object.keys(ls.bookmarks || {}).length,
      readItems:     Object.keys(ls.readItems || {}).length,
      events:        Object.keys(ls.eventAccepted || {}).length + Object.keys(ls.eventSkipped || {}).length,
      briefingDates: Object.keys(ls.briefingCheckboxes || {}).length,
      projects:      (server.projects || []).length,
    };
  },

  _download(filename, content) {
    const blob = new Blob([content], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },

  _safeJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  },

  // ─── Import ─────────────────────────────────────────────────────────────

  /**
   * Opens a file picker and imports the selected backup.
   * mode: 'merge' (default) | 'replace'
   */
  importFromFile(mode = 'merge') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type   = 'file';
      input.accept = '.json,application/json';

      let settled = false;
      const settle = (result) => { if (!settled) { settled = true; resolve(result); } };

      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) { settle({ ok: false, cancelled: true }); return; }
        try {
          const text   = await file.text();
          const bundle = JSON.parse(text);
          const result = await this.importFromBundle(bundle, mode);
          settle(result);
        } catch (err) {
          settle({ ok: false, error: `Invalid file: ${err.message}` });
        }
      });

      // Detect cancel: window regains focus without a file being selected
      const onFocus = () => setTimeout(() => settle({ ok: false, cancelled: true }), 400);
      window.addEventListener('focus', onFocus, { once: true });

      input.click();
    });
  },

  async importFromBundle(bundle, mode = 'merge') {
    if (!bundle || !bundle.version || !bundle.localStorage) {
      return { ok: false, error: 'Invalid backup — missing required fields.' };
    }

    const ls = bundle.localStorage;

    if (mode === 'replace') {
      this._clearCyberspaceKeys();
      this._writeLocalStorage(ls);
    } else {
      this._mergeLocalStorage(ls);
    }

    let serverResult = { ok: true, projectsImported: 0 };
    if (bundle.server?.projects?.length > 0) {
      serverResult = await this._postServerImport(bundle.server, mode);
    }

    this._notifyModules();
    return { ok: true, mode, counts: this._countBundle(ls, bundle.server || {}), serverResult };
  },

  // ─── Merge strategy ──────────────────────────────────────────────────────

  _mergeLocalStorage(ls) {
    // Tasks: append by id — skip any already present
    if (Array.isArray(ls.tasks)) {
      const existing    = this._safeJson('cyberspace-todos', []);
      const existingIds = new Set(existing.map(t => t.id));
      localStorage.setItem('cyberspace-todos',
        JSON.stringify([...existing, ...ls.tasks.filter(t => !existingIds.has(t.id))]));
    }

    // Links: append by id
    if (Array.isArray(ls.links)) {
      const existing    = this._safeJson('cyberspace-links', []);
      const existingIds = new Set(existing.map(l => l.id));
      localStorage.setItem('cyberspace-links',
        JSON.stringify([...existing, ...ls.links.filter(l => !existingIds.has(l.id))]));
    }

    // Bookmarks: union; existing timestamps win
    if (ls.bookmarks && typeof ls.bookmarks === 'object') {
      const existing = this._safeJson('cyberspace-bookmarks', {});
      localStorage.setItem('cyberspace-bookmarks', JSON.stringify({ ...ls.bookmarks, ...existing }));
    }

    // Read items: union (once read, stays read)
    if (ls.readItems && typeof ls.readItems === 'object') {
      const existing = this._safeJson('cyberspace-read-items', {});
      localStorage.setItem('cyberspace-read-items', JSON.stringify({ ...ls.readItems, ...existing }));
    }

    // Announcements seen: union
    if (Array.isArray(ls.announcementsSeen)) {
      const existing = this._safeJson('cyberspace-announcements-seen', []);
      localStorage.setItem('cyberspace-announcements-seen',
        JSON.stringify([...new Set([...existing, ...ls.announcementsSeen])]));
    }

    // Level: keep higher XP; merge rewarded map (existing wins on conflict)
    if (ls.level && typeof ls.level === 'object') {
      const existingXp = parseInt(localStorage.getItem('cyberspace-xp') || '0', 10);
      const importXp   = parseInt(ls.level.xp || '0', 10);
      if (importXp > existingXp) localStorage.setItem('cyberspace-xp', String(importXp));
      if (ls.level.rewarded && typeof ls.level.rewarded === 'object') {
        const existing = this._safeJson('cyberspace-xp-rewarded', {});
        localStorage.setItem('cyberspace-xp-rewarded',
          JSON.stringify({ ...ls.level.rewarded, ...existing }));
      }
    }

    // Briefing checkboxes: per-date merge; existing wins on conflict
    if (ls.briefingCheckboxes && typeof ls.briefingCheckboxes === 'object') {
      for (const [date, checks] of Object.entries(ls.briefingCheckboxes)) {
        if (!date || typeof checks !== 'object') continue;
        const key      = `checkboxes-${date}`;
        const existing = JSON.parse(localStorage.getItem(key) || '{}');
        localStorage.setItem(key, JSON.stringify({ ...checks, ...existing }));
      }
    }

    // Hidden briefing actions: union per date
    if (ls.briefingActionsHidden && typeof ls.briefingActionsHidden === 'object') {
      for (const [date, arr] of Object.entries(ls.briefingActionsHidden)) {
        if (!date || !Array.isArray(arr)) continue;
        const key      = `briefing-actions-hidden-${date}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify([...new Set([...existing, ...arr])]));
      }
    }

    // Hidden further reading: union per date
    if (ls.briefingFurtherHidden && typeof ls.briefingFurtherHidden === 'object') {
      for (const [date, arr] of Object.entries(ls.briefingFurtherHidden)) {
        if (!date || !Array.isArray(arr)) continue;
        const key      = `briefing-further-hidden-${date}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify([...new Set([...existing, ...arr])]));
      }
    }

    // Event accepted/skipped: union; existing wins
    if (ls.eventAccepted && typeof ls.eventAccepted === 'object') {
      for (const [id, val] of Object.entries(ls.eventAccepted)) {
        if (!localStorage.getItem(`event-accepted-${id}`)) {
          localStorage.setItem(`event-accepted-${id}`, val);
        }
      }
    }
    if (ls.eventSkipped && typeof ls.eventSkipped === 'object') {
      for (const [id, val] of Object.entries(ls.eventSkipped)) {
        if (!localStorage.getItem(`event-skipped-${id}`)) {
          localStorage.setItem(`event-skipped-${id}`, val);
        }
      }
    }
  },

  // ─── Replace strategy ─────────────────────────────────────────────────────

  _writeLocalStorage(ls) {
    if (Array.isArray(ls.tasks))
      localStorage.setItem('cyberspace-todos', JSON.stringify(ls.tasks));
    if (Array.isArray(ls.links))
      localStorage.setItem('cyberspace-links', JSON.stringify(ls.links));
    if (ls.bookmarks)
      localStorage.setItem('cyberspace-bookmarks', JSON.stringify(ls.bookmarks));
    if (ls.readItems)
      localStorage.setItem('cyberspace-read-items', JSON.stringify(ls.readItems));
    if (Array.isArray(ls.announcementsSeen))
      localStorage.setItem('cyberspace-announcements-seen', JSON.stringify(ls.announcementsSeen));
    if (ls.level) {
      if (ls.level.enabled != null) localStorage.setItem('cyberspace-leveling-enabled', ls.level.enabled);
      if (ls.level.xp     != null) localStorage.setItem('cyberspace-xp', String(ls.level.xp));
      if (ls.level.rewarded)       localStorage.setItem('cyberspace-xp-rewarded', JSON.stringify(ls.level.rewarded));
    }
    for (const [date, checks] of Object.entries(ls.briefingCheckboxes || {}))
      localStorage.setItem(`checkboxes-${date}`, JSON.stringify(checks));
    for (const [date, arr] of Object.entries(ls.briefingActionsHidden || {}))
      localStorage.setItem(`briefing-actions-hidden-${date}`, JSON.stringify(arr));
    for (const [date, arr] of Object.entries(ls.briefingFurtherHidden || {}))
      localStorage.setItem(`briefing-further-hidden-${date}`, JSON.stringify(arr));
    for (const [id, val] of Object.entries(ls.eventAccepted || {}))
      localStorage.setItem(`event-accepted-${id}`, val);
    for (const [id, val] of Object.entries(ls.eventSkipped || {}))
      localStorage.setItem(`event-skipped-${id}`, val);
  },

  _clearCyberspaceKeys() {
    // Collect keys first — can't mutate while iterating
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('cyberspace-') ||
        key.startsWith('checkboxes-') ||
        key.startsWith('briefing-actions-hidden-') ||
        key.startsWith('briefing-further-hidden-') ||
        key.startsWith('event-accepted-') ||
        key.startsWith('event-skipped-')
      ) toRemove.push(key);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  },

  // ─── Server-side data ────────────────────────────────────────────────────

  async _postServerImport(serverData, mode) {
    try {
      const res = await fetch('/api/data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: serverData.projects || [], mode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || 'Server import failed' };
      }
      return await res.json();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  // ─── Post-import refresh ─────────────────────────────────────────────────

  _notifyModules() {
    if (typeof TodoList !== 'undefined') {
      TodoList.renderMyTasks();
      TodoList.renderMyLinks();
      TodoList.renderBriefingActions();
      TodoList.renderFurtherReading();
    }
    if (typeof Events !== 'undefined' && Events.applyFilters) Events.applyFilters();
    if (typeof Feeds !== 'undefined') {
      if (Feeds.render)      Feeds.render();
      if (Feeds.updateBadge) Feeds.updateBadge();
    }
    if (typeof App !== 'undefined' && App.updateUnreadCount) App.updateUnreadCount();
    if (typeof LevelSystem !== 'undefined' && LevelSystem.renderWidget) LevelSystem.renderWidget();
  },
};
