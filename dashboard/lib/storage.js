/**
 * Storage abstraction layer.
 * Routes mutable file operations to Turso DB (production) or
 * the local filesystem (development). Read-only paths (reports/)
 * always go through the filesystem.
 *
 * Multi-user support: when a userId is provided, config/ and data/
 * paths are namespaced under users/{userId}/ in database storage.
 * Unauthenticated reads of config/ fall back to *.example.md files.
 *
 * Path convention:
 *   config/*  → PROJECT_ROOT/config/*   (handled by fileManager)
 *   data/*    → dashboard/data/*        (internal storage, direct fs)
 *   reports/* → PROJECT_ROOT/reports/*  (read-only, fileManager)
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const IS_VERCEL = !!process.env.VERCEL;

const fm = require('./fileManager');
const db = IS_VERCEL ? require('./dbStorage') : null;

// dashboard/data/ directory for local data files
const DATA_DIR = path.resolve(__dirname, '..', 'data');

// On Vercel, all dynamic content goes through the database
const DB_PREFIXES = ['config/', 'data/', 'reports/'];

// Prefixes that get per-user namespacing
const USER_PREFIXES = ['config/', 'data/'];

function usesDb(relativePath) {
  return IS_VERCEL && DB_PREFIXES.some(p => relativePath.startsWith(p));
}

/**
 * Resolve a path for per-user database storage.
 * config/rss.md with userId "123" → users/123/config/rss.md
 */
function userScopedPath(relativePath, userId) {
  if (!userId) return relativePath;
  // Validate userId is alphanumeric to prevent path traversal (e.g. ../../)
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) return relativePath;
  if (!USER_PREFIXES.some(p => relativePath.startsWith(p))) return relativePath;
  return `users/${userId}/${relativePath}`;
}

/**
 * For unauthenticated config reads, map to the .example.md variant.
 * config/rss.md → config/rss.example.md
 */
function examplePath(relativePath) {
  if (!relativePath.startsWith('config/') || !relativePath.endsWith('.md')) {
    return relativePath;
  }
  return relativePath.replace(/\.md$/, '.example.md');
}

/**
 * For data/* paths, resolve to dashboard/data/* on the local filesystem.
 * These bypass fileManager (which blocks dashboard/ paths and resolves
 * relative to PROJECT_ROOT).
 */
function isDataPath(relativePath) {
  return relativePath.startsWith('data/');
}

const RESOLVED_DATA_DIR = path.resolve(DATA_DIR);

function resolveDataPath(relativePath) {
  const filePath = path.resolve(DATA_DIR, relativePath.slice('data/'.length));
  // Guard against path traversal (e.g. data/../../etc/passwd)
  if (!filePath.startsWith(RESOLVED_DATA_DIR + path.sep)) return null;
  return filePath;
}

async function readDataFile(relativePath) {
  const filePath = resolveDataPath(relativePath);
  if (!filePath) return { error: 'Forbidden', status: 403 };
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    return { content };
  } catch (err) {
    if (err.code === 'ENOENT') return { error: 'File not found', status: 404 };
    return { error: err.message, status: 500 };
  }
}

async function writeDataFile(relativePath, content) {
  const filePath = resolveDataPath(relativePath);
  if (!filePath) return { error: 'Forbidden', status: 403 };
  try {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

async function appendDataFile(relativePath, content) {
  const filePath = resolveDataPath(relativePath);
  if (!filePath) return { error: 'Forbidden', status: 403 };
  try {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.appendFile(filePath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

/**
 * Read a file. Options:
 *   userId — namespace config/data paths per-user in database
 */
async function readFile(relativePath, { userId } = {}) {
  if (usesDb(relativePath)) {
    const scopedPath = userScopedPath(relativePath, userId);
    const result = await db.readFile(scopedPath);

    if (result.error && result.status === 404) {
      if (userId && USER_PREFIXES.some(p => relativePath.startsWith(p))) {
        // User has no custom copy yet — fallback chain:
        // 1. Try the global db path (admin's real config)
        const globalResult = await db.readFile(relativePath);
        if (!globalResult.error) return globalResult;

        // 2. Try the example file from the deployed filesystem
        if (relativePath.startsWith('config/')) {
          const exResult = await fm.readFile(examplePath(relativePath));
          if (!exResult.error) return exResult;
        }

        // 3. Last resort: try the original path from filesystem
        return isDataPath(relativePath) ? readDataFile(relativePath) : await fm.readFile(relativePath);
      }
      // No userId — unauthenticated or non-user path: seed from filesystem
      return isDataPath(relativePath) ? readDataFile(relativePath) : await fm.readFile(relativePath);
    }
    return result;
  }
  if (isDataPath(relativePath)) return readDataFile(relativePath);
  return await fm.readFile(relativePath);
}

/**
 * Write a file. Options:
 *   userId — namespace config/data paths per-user in database
 */
async function writeFile(relativePath, content, { userId } = {}) {
  if (usesDb(relativePath)) {
    const scopedPath = userScopedPath(relativePath, userId);
    return db.writeFile(scopedPath, content);
  }
  if (isDataPath(relativePath)) return writeDataFile(relativePath, content);
  return fm.writeFile(relativePath, content);
}

/**
 * Append to a file. Options:
 *   userId — namespace config/data paths per-user in database
 */
async function appendFile(relativePath, content, { userId } = {}) {
  if (usesDb(relativePath)) {
    const scopedPath = userScopedPath(relativePath, userId);
    return db.appendFile(scopedPath, content);
  }
  if (isDataPath(relativePath)) return appendDataFile(relativePath, content);
  return fm.appendFile(relativePath, content);
}

function invalidateCache(relativePath) {
  fm.invalidateCache(relativePath);
  if (db) db.invalidateCache(relativePath);
}

const { PROJECT_ROOT, resolveSafePath } = fm;

async function listReportDates() {
  if (IS_VERCEL) return db.listReportDates();
  return fm.listReportDates();
}

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
