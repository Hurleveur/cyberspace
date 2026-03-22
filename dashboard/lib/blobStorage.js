/**
 * Vercel Blob storage backend.
 * Same interface shape as fileManager: readFile, writeFile, appendFile.
 * Only loaded when process.env.VERCEL is set.
 */
const { put, list } = require('@vercel/blob');

const PREFIX = 'cyberspace/';
const CACHE_TTL = 60_000; // 1 minute in-memory TTL

const _cache = new Map(); // relativePath → { content, expiresAt }

async function readFile(relativePath) {
  const cached = _cache.get(relativePath);
  if (cached && Date.now() < cached.expiresAt) {
    return { content: cached.content };
  }

  try {
    const { blobs } = await list({ prefix: PREFIX + relativePath });
    if (!blobs.length) return { error: 'Not found', status: 404 };

    const res = await fetch(blobs[0].url);
    if (!res.ok) return { error: 'Blob fetch failed', status: 502 };

    const content = await res.text();
    _cache.set(relativePath, { content, expiresAt: Date.now() + CACHE_TTL });
    return { content };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

async function writeFile(relativePath, content) {
  try {
    await put(PREFIX + relativePath, content, {
      access: 'public',
      addRandomSuffix: false,
    });
    _cache.set(relativePath, { content, expiresAt: Date.now() + CACHE_TTL });
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

async function appendFile(relativePath, content) {
  const existing = await readFile(relativePath);
  const combined = (existing.content || '') + content;
  return writeFile(relativePath, combined);
}

function invalidateCache(relativePath) {
  if (relativePath) {
    _cache.delete(relativePath);
  }
}

module.exports = { readFile, writeFile, appendFile, invalidateCache };
