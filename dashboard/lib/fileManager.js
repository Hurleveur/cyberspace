const fs = require('fs');
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
 * Read a file. Returns { content, error }.
 */
function readFile(relativePath) {
  const resolved = resolveSafePath(relativePath);
  if (!resolved) return { error: 'Path not allowed', status: 403 };

  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    return { content };
  } catch (err) {
    if (err.code === 'ENOENT') return { error: 'File not found', status: 404 };
    return { error: err.message, status: 500 };
  }
}

/**
 * Write (overwrite) a file. Returns { ok, error }.
 */
function writeFile(relativePath, content) {
  const resolved = resolveSafePath(relativePath);
  if (!resolved) return { error: 'Path not allowed', status: 403 };

  try {
    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

/**
 * Append text to a file. Creates the file if it doesn't exist.
 */
function appendFile(relativePath, content) {
  const resolved = resolveSafePath(relativePath);
  if (!resolved) return { error: 'Path not allowed', status: 403 };

  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.appendFileSync(resolved, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

/**
 * List report dates (folders in reports/).
 */
function listReportDates() {
  const reportsDir = path.join(PROJECT_ROOT, 'reports');
  try {
    const entries = fs.readdirSync(reportsDir, { withFileTypes: true });
    const dates = entries
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse(); // Most recent first
    return { dates };
  } catch (err) {
    return { dates: [] };
  }
}

/**
 * Get the most recent report date.
 */
function latestReportDate() {
  const { dates } = listReportDates();
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
};
