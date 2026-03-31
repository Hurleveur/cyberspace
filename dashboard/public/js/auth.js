/**
 * Auth helper — cookie-based authentication via GitHub OAuth.
 *
 * On Vercel: user logs in via GitHub OAuth → JWT stored in HttpOnly cookie.
 * On local dev: no auth, full access.
 *
 * Backwards compatibility: if a localStorage token exists and no cookie session
 * is active, Bearer token injection is preserved for migration.
 */
const Auth = {
  STORAGE_KEY: 'cyberspace-auth-token',
  user: null,       // { id, login, role, avatar } or null
  readOnly: false,   // true when unauthenticated on Vercel
  oauthConfigured: false,
  _ready: null,      // Promise that resolves when init completes

  init() {
    // Fetch current user from server
    this._ready = this._fetchUser();

    // Legacy Bearer token fallback (if no cookie session)
    this._setupLegacyTokenFallback();
  },

  async _fetchUser() {
    try {
      const res = await fetch('/auth/me');
      if (res.ok) {
        const data = await res.json();
        this.user = data.user;
        this.oauthConfigured = data.oauthConfigured;
        this.readOnly = !this.user && this.oauthConfigured;
      }
    } catch {
      // Network error — assume local dev, no auth needed
      this.user = null;
      this.readOnly = false;
    }
  },

  _setupLegacyTokenFallback() {
    const token = localStorage.getItem(this.STORAGE_KEY);
    if (!token) return;

    // Monkey-patch fetch to inject Bearer token as fallback
    const originalFetch = window.fetch;
    const self = this;
    window.fetch = function (input, init) {
      // Only inject if no cookie session is active
      if (!self.user) {
        const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
        if (url.startsWith('/api/') || url.includes('/api/')) {
          init = init || {};
          init.headers = new Headers(init.headers || {});
          if (!init.headers.has('Authorization')) {
            init.headers.set('Authorization', 'Bearer ' + token);
          }
        }
      }
      return originalFetch.call(this, input, init);
    };
  },

  /** Wait for auth state to be resolved. */
  async whenReady() {
    if (this._ready) await this._ready;
  },

  isAuthenticated() {
    return !!this.user;
  },

  isAdmin() {
    return this.user?.role === 'admin';
  },

  isReadOnly() {
    return this.readOnly;
  },

  getToken() {
    return localStorage.getItem(this.STORAGE_KEY) || null;
  },

  setToken(token) {
    if (token) {
      localStorage.setItem(this.STORAGE_KEY, token);
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  },

  logout() {
    // Clear legacy token
    localStorage.removeItem(this.STORAGE_KEY);
    // POST to logout endpoint (clears cookie)
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/logout';
    document.body.appendChild(form);
    form.submit();
  },
};

Auth.init();
