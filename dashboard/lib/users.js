/**
 * User registry — CRUD for cyberspace/users.json in Vercel Blob.
 *
 * Stores user records (GitHub ID, login, role, timestamps).
 * On local dev, this module is a no-op passthrough.
 */
const IS_VERCEL = !!process.env.VERCEL;

let blob = null;
if (IS_VERCEL) {
  blob = require('./blobStorage');
}

const USERS_PATH = 'users.json';
const MIGRATION_MARKER = 'migration-v2.json';

// In-memory cache (refreshed on write or after TTL)
let _cache = null;
let _cacheExpiry = 0;
const CACHE_TTL = 30_000; // 30 seconds

async function _readRegistry() {
  if (!blob) return { users: {} };
  if (_cache && Date.now() < _cacheExpiry) return _cache;

  const result = await blob.readFile(USERS_PATH);
  if (result.error) {
    // First time — no users.json exists yet
    const empty = { users: {} };
    _cache = empty;
    _cacheExpiry = Date.now() + CACHE_TTL;
    return empty;
  }
  try {
    const data = JSON.parse(result.content);
    _cache = data;
    _cacheExpiry = Date.now() + CACHE_TTL;
    return data;
  } catch {
    const empty = { users: {} };
    _cache = empty;
    _cacheExpiry = Date.now() + CACHE_TTL;
    return empty;
  }
}

async function _writeRegistry(data) {
  if (!blob) return;
  await blob.writeFile(USERS_PATH, JSON.stringify(data, null, 2));
  _cache = data;
  _cacheExpiry = Date.now() + CACHE_TTL;
}

/**
 * Get a user by GitHub ID. Returns user object or null.
 */
async function getUser(id) {
  const registry = await _readRegistry();
  return registry.users[String(id)] || null;
}

/**
 * Create or update a user record. Merges with existing data.
 */
async function upsertUser(id, data) {
  const registry = await _readRegistry();
  const key = String(id);
  const existing = registry.users[key] || {};
  registry.users[key] = {
    ...existing,
    ...data,
    lastLogin: new Date().toISOString(),
  };
  if (!registry.users[key].createdAt) {
    registry.users[key].createdAt = new Date().toISOString();
  }
  await _writeRegistry(registry);
  return registry.users[key];
}

/**
 * List all users. Returns array of { id, ...userData }.
 */
async function listUsers() {
  const registry = await _readRegistry();
  return Object.entries(registry.users).map(([id, data]) => ({ id, ...data }));
}

/**
 * Update a user's role.
 */
async function setUserRole(id, role) {
  const registry = await _readRegistry();
  const key = String(id);
  if (!registry.users[key]) return null;
  registry.users[key].role = role;
  await _writeRegistry(registry);
  return registry.users[key];
}

/**
 * One-time migration: copy admin's config/* from global blob to users/{id}/config/*.
 * Only runs if migration marker doesn't exist.
 */
async function migrateAdminConfig(userId) {
  if (!blob) return;

  // Check if migration already done
  const marker = await blob.readFile(MIGRATION_MARKER);
  if (!marker.error) return; // Already migrated

  const CONFIG_FILES = [
    'config/interests.md',
    'config/news.md',
    'config/events.md',
    'config/rss.md',
    'config/feedback.md',
    'config/seen-events.md',
    'config/previous-news.md',
  ];

  let migrated = 0;
  for (const file of CONFIG_FILES) {
    const result = await blob.readFile(file);
    if (!result.error) {
      const userPath = `users/${userId}/${file}`;
      await blob.writeFile(userPath, result.content);
      migrated++;
    }
  }

  // Write migration marker
  await blob.writeFile(MIGRATION_MARKER, JSON.stringify({
    migratedAt: new Date().toISOString(),
    adminId: userId,
    filesMigrated: migrated,
  }));

  console.log(`[users] Migrated ${migrated} config files for admin ${userId}`);
}

module.exports = {
  getUser,
  upsertUser,
  listUsers,
  setUserRole,
  migrateAdminConfig,
};
