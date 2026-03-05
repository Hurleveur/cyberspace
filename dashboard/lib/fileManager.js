const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

// Root of the cyberspace project (one level up from dashboard/)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Paths that are never accessible via the file API
const BLOCKED_PATTERNS = [
  /^dashboard\//,       // Don't expose dashboard source code
  /\/\.env/,            // Block .env files
  /\/\./,              // Block all dotfiles/dotdirs
];

// Only allow these extensions
const ALLOWED_EXTENSIONS = ['.md', '.json'];

// ── In-memory cache ───────────────────────────────────────────────────────────

const _fileCache = new Map();    // key: relativePath → { content, mtime }
let _reportDatesCache = null;    // { dates: [...], cachedAt: number }

/**
 * Invalidate cache entries for a given relative path.
 * Called by the file watcher in server.js.
 */
function invalidateCache(relativePath) {
  if (relativePath) {
    _fileCache.delete(relativePath);
  }
  // Invalidate report dates if a reports/ folder changed
  if (!relativePath || relativePath.startsWith('reports/')) {
    _reportDatesCache = null;
  }
}

/**
 * Validate and resolve a relative path to an absolute path within PROJECT_ROOT.
 * Returns null if the path is invalid or blocked.
 */
function resolveSafePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return null;

  // Normalize and resolve
  const resolved = path.resolve(PROJECT_ROOT, relativePath);

  // Must be within PROJECT_ROOT
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    return null;
  }

  // Check blocked patterns against the relative portion
  const rel = path.relative(PROJECT_ROOT, resolved).replace(/\\/g, '/');
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(rel)) return null;
  }

  // Check extension
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return null;

  return resolved;
}

/**
 * Read a file (async). Returns { content, error }.
 * Uses in-memory cache when available.
 */
async function readFile(relativePath) {
  const resolved = resolveSafePath(relativePath);
  if (!resolved) return { error: 'Path not allowed', status: 403 };

  // Check cache
  const cached = _fileCache.get(relativePath);
  if (cached) return { content: cached.content };

  try {
    const content = await fsp.readFile(resolved, 'utf-8');
    _fileCache.set(relativePath, { content, mtime: Date.now() });
    return { content };
  } catch (err) {
    if (err.code === 'ENOENT') return { error: 'File not found', status: 404 };
    return { error: err.message, status: 500 };
  }
}

/**
 * Write (overwrite) a file (async). Returns { ok, error }.
 */
async function writeFile(relativePath, content) {
  const resolved = resolveSafePath(relativePath);
  if (!resolved) return { error: 'Path not allowed', status: 403 };

  try {
    await fsp.mkdir(path.dirname(resolved), { recursive: true });
    await fsp.writeFile(resolved, content, 'utf-8');
    invalidateCache(relativePath);
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

/**
 * Append text to a file. Creates the file if it doesn't exist.
 */
async function appendFile(relativePath, content) {
  const resolved = resolveSafePath(relativePath);
  if (!resolved) return { error: 'Path not allowed', status: 403 };

  try {
    await fsp.mkdir(path.dirname(resolved), { recursive: true });
    await fsp.appendFile(resolved, content, 'utf-8');
    invalidateCache(relativePath);
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

/**
 * List report dates (folders in reports/). Cached.
 */
async function listReportDates() {
  if (_reportDatesCache) return _reportDatesCache;

  const reportsDir = path.join(PROJECT_ROOT, 'reports');
  try {
    const entries = await fsp.readdir(reportsDir, { withFileTypes: true });
    const dates = entries
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse(); // Most recent first
    _reportDatesCache = { dates };
    return _reportDatesCache;
  } catch (err) {
    console.error('[fileManager] listReportDates error:', err.message);
    return { dates: [] };
  }
}

/**
 * Get the most recent report date.
 */
async function latestReportDate() {
  const { dates } = await listReportDates();
  return dates.length > 0 ? dates[0] : null;
}

module.exports = {
  PROJECT_ROOT,
  resolveSafePath,
  readFile,
  writeFile,
  appendFile,
  listReportDates,
  latestReportDate,
  invalidateCache,
};
