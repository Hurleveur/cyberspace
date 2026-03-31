/**
 * Authentication module — GitHub OAuth + JWT sessions.
 *
 * On Vercel: GitHub OAuth flow → JWT in __session cookie.
 * On local dev: auth is skipped entirely (passthrough).
 * AUTH_TOKEN bearer fallback for sync scripts.
 */
const { SignJWT, jwtVerify } = require('jose');
const crypto = require('crypto');

const IS_VERCEL = !!process.env.VERCEL;

const GITHUB_CLIENT_ID     = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const JWT_SECRET           = process.env.JWT_SECRET || '';
const AUTH_TOKEN           = process.env.AUTH_TOKEN || null;
const ADMIN_GITHUB_IDS     = (process.env.ADMIN_GITHUB_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const JWT_EXPIRY  = '7d';
const COOKIE_NAME = '__session';
const STATE_COOKIE = '__oauth_state';

// Encode JWT_SECRET as Uint8Array for jose
const secretKey = new TextEncoder().encode(JWT_SECRET);

/**
 * Create a signed JWT with user info.
 */
async function createJWT({ sub, login, role, avatar }) {
  return new SignJWT({ sub, login, role, avatar })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secretKey);
}

/**
 * Verify and decode a JWT. Returns payload or null.
 */
async function verifyJWT(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Parse cookies from the Cookie header.
 */
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach(pair => {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

/**
 * Set a cookie on the response.
 */
function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  // Append to existing Set-Cookie headers
  const existing = res.getHeader('Set-Cookie') || [];
  const arr = Array.isArray(existing) ? existing : [existing].filter(Boolean);
  arr.push(parts.join('; '));
  res.setHeader('Set-Cookie', arr);
}

/**
 * Clear a cookie.
 */
function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0, path: '/' });
}

/**
 * Determine role for a GitHub user ID.
 */
function determineRole(githubId) {
  return ADMIN_GITHUB_IDS.includes(String(githubId)) ? 'admin' : 'user';
}

/**
 * Resolve the authenticated user from the request.
 * Checks __session cookie (JWT) first, then AUTH_TOKEN bearer fallback.
 * Returns { id, login, role, avatar } or null.
 */
async function resolveUser(req) {
  // 1. Try JWT cookie
  const cookies = parseCookies(req);
  const sessionToken = cookies[COOKIE_NAME];
  if (sessionToken) {
    const payload = await verifyJWT(sessionToken);
    if (payload) {
      return {
        id: payload.sub,
        login: payload.login,
        role: payload.role,
        avatar: payload.avatar || null,
      };
    }
  }

  // 2. Try AUTH_TOKEN bearer (for sync scripts)
  if (AUTH_TOKEN) {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : String(req.query?.token || '');
    if (bearer && bearer === AUTH_TOKEN) {
      return { id: '__token', login: 'api-token', role: 'admin', avatar: null };
    }
  }

  return null;
}

/**
 * Middleware: require any authenticated user.
 * On local dev (non-Vercel), passes through.
 */
function requireAuth(req, res, next) {
  if (!IS_VERCEL) return next();
  if (!res.locals.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

/**
 * Middleware: require admin role.
 */
function requireAdmin(req, res, next) {
  if (!IS_VERCEL) return next();
  if (!res.locals.user) return res.status(401).json({ error: 'Unauthorized' });
  if (res.locals.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

/**
 * Middleware: for config file reads — unauthenticated users get example files.
 * Sets res.locals.readOnly = true when serving example content.
 */
function requireAuthForConfig(req, res, next) {
  if (!IS_VERCEL) return next();
  const p = String(req.query.path || '');
  if (!p.startsWith('config/')) return next();

  if (!res.locals.user) {
    // Rewrite to example file
    const basename = p.replace(/^config\//, '');
    const name = basename.replace(/\.md$/, '');
    req.query.path = `config/${name}.example.md`;
    res.locals.readOnly = true;
  }
  next();
}

/**
 * Middleware: attach user to res.locals from cookie/bearer.
 * Should be used early in the middleware chain.
 */
async function attachUser(req, res, next) {
  if (!IS_VERCEL) return next();
  res.locals.user = await resolveUser(req);
  next();
}

/**
 * Middleware: CSRF protection for state-mutating requests.
 * Checks Origin header matches the expected host.
 */
function csrfProtection(req, res, next) {
  if (!IS_VERCEL) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // Bearer token requests are not cookie-based, skip CSRF
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return next();

  const origin = req.headers.origin;
  if (!origin) return next(); // Allow requests without Origin (e.g., same-origin fetch)

  const host = req.headers.host;
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return res.status(403).json({ error: 'CSRF: Origin mismatch' });
    }
  } catch {
    return res.status(403).json({ error: 'CSRF: Invalid origin' });
  }
  next();
}

/**
 * Generate the GitHub OAuth authorization URL.
 */
function getGitHubAuthUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'read:user',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * Exchange an OAuth code for a GitHub access token.
 */
async function exchangeCode(code, redirectUri) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

/**
 * Fetch GitHub user profile with an access token.
 */
async function fetchGitHubUser(accessToken) {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Cyberspace-Dashboard/1.0',
    },
  });
  if (!res.ok) throw new Error('Failed to fetch GitHub user');
  return res.json();
}

/**
 * Check if GitHub OAuth is configured.
 */
function isOAuthConfigured() {
  return !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET && JWT_SECRET);
}

module.exports = {
  createJWT,
  verifyJWT,
  resolveUser,
  requireAuth,
  requireAdmin,
  requireAuthForConfig,
  attachUser,
  csrfProtection,
  determineRole,
  parseCookies,
  setCookie,
  clearCookie,
  getGitHubAuthUrl,
  exchangeCode,
  fetchGitHubUser,
  isOAuthConfigured,
  COOKIE_NAME,
  STATE_COOKIE,
};
