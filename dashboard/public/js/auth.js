/**
 * Auth helper — automatically attaches AUTH_TOKEN to all /api/ requests.
 *
 * Token source (checked in order):
 *   1. ?token=xxx in the page URL (persisted to localStorage on first visit)
 *   2. localStorage 'cyberspace-auth-token'
 *
 * When a token is present, every fetch() call to a /api/ path gets an
 * Authorization: Bearer header injected automatically.
 */
const Auth = {
  STORAGE_KEY: 'cyberspace-auth-token',

  init() {
    // Check URL for ?token= parameter and persist it
    const params = new URLSearchParams(location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem(this.STORAGE_KEY, urlToken);
      // Clean the token from the URL so it isn't shared accidentally
      params.delete('token');
      const clean = params.toString();
      const newUrl = location.pathname + (clean ? '?' + clean : '') + location.hash;
      history.replaceState(null, '', newUrl);
    }

    const token = this.getToken();
    if (!token) return;

    // Monkey-patch fetch to inject auth header on /api/ requests
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
      if (url.startsWith('/api/') || url.includes('/api/')) {
        init = init || {};
        init.headers = new Headers(init.headers || {});
        if (!init.headers.has('Authorization')) {
          init.headers.set('Authorization', 'Bearer ' + token);
        }
      }
      return originalFetch.call(this, input, init);
    };
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
};

Auth.init();
