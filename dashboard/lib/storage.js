/**
 * Storage abstraction layer.
 * Routes mutable file operations to Vercel Blob (production) or
 * the local filesystem (development). Read-only paths (reports/)
 * always go through the filesystem.
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
const blob = IS_VERCEL ? require('./blobStorage') : null;

// dashboard/data/ directory for local data files
const DATA_DIR = path.resolve(__dirname, '..', 'data');

// On Vercel, all dynamic content goes through blob (reports aren't on the filesystem)
const BLOB_PREFIXES = ['config/', 'data/', 'reports/'];

function usesBlob(relativePath) {
  return IS_VERCEL && BLOB_PREFIXES.some(p => relativePath.startsWith(p));
}

/**
 * For data/* paths, resolve to dashboard/data/* on the local filesystem.
 * These bypass fileManager (which blocks dashboard/ paths and resolves
 * relative to PROJECT_ROOT).
 */
function isDataPath(relativePath) {
  return relativePath.startsWith('data/');
}

async function readDataFile(relativePath) {
  const filePath = path.join(DATA_DIR, relativePath.slice('data/'.length));
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    return { content };
  } catch (err) {
    if (err.code === 'ENOENT') return { error: 'File not found', status: 404 };
    return { error: err.message, status: 500 };
  }
}

async function writeDataFile(relativePath, content) {
  const filePath = path.join(DATA_DIR, relativePath.slice('data/'.length));
  try {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

async function appendDataFile(relativePath, content) {
  const filePath = path.join(DATA_DIR, relativePath.slice('data/'.length));
  try {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.appendFile(filePath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

async function readFile(relativePath) {
  if (usesBlob(relativePath)) {
    const result = await blob.readFile(relativePath);
    // Seed from deployed filesystem on first access (blob empty)
    if (result.error && result.status === 404) {
      return isDataPath(relativePath) ? readDataFile(relativePath) : fm.readFile(relativePath);
    }
    return result;
  }
  if (isDataPath(relativePath)) return readDataFile(relativePath);
  return fm.readFile(relativePath);
}

async function writeFile(relativePath, content) {
  if (usesBlob(relativePath)) return blob.writeFile(relativePath, content);
  if (isDataPath(relativePath)) return writeDataFile(relativePath, content);
  return fm.writeFile(relativePath, content);
}

async function appendFile(relativePath, content) {
  if (usesBlob(relativePath)) return blob.appendFile(relativePath, content);
  if (isDataPath(relativePath)) return appendDataFile(relativePath, content);
  return fm.appendFile(relativePath, content);
}

function invalidateCache(relativePath) {
  fm.invalidateCache(relativePath);
  if (blob) blob.invalidateCache(relativePath);
}

const { PROJECT_ROOT, resolveSafePath } = fm;

async function listReportDates() {
  if (IS_VERCEL) return blob.listReportDates();
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
