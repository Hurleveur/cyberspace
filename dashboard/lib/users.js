/**
 * User registry — CRUD backed by Turso database (production)
 * or no-op passthrough (local dev).
 */
const IS_VERCEL = !!process.env.VERCEL;

let db = null;
if (IS_VERCEL) {
  db = require('./dbStorage');
}

/**
 * Get a user by GitHub ID. Returns user object or null.
 */
async function getUser(id) {
  if (!db) return null;
  return db.getUser(id);
}

/**
 * Create or update a user record. Merges with existing data.
 */
async function upsertUser(id, data) {
  if (!db) return { id: String(id), ...data };
  return db.upsertUser(id, data);
}

/**
 * List all users. Returns array of { id, ...userData }.
 */
async function listUsers() {
  if (!db) return [];
  return db.listUsers();
}

/**
 * Update a user's role.
 */
async function setUserRole(id, role) {
  if (!db) return null;
  return db.setUserRole(id, role);
}

/**
 * One-time migration: copy admin's config/* from global DB to users/{id}/config/*.
 * Only runs if migration marker doesn't exist.
 */
async function migrateAdminConfig(userId) {
  if (!db) return;

  // Check if migration already done
  const marker = await db.getMigrationMarker('migration-v2');
  if (marker) return;

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
    const result = await db.readFile(file);
    if (!result.error) {
      const userPath = `users/${userId}/${file}`;
      await db.writeFile(userPath, result.content);
      migrated++;
    }
  }

  await db.setMigrationMarker('migration-v2', {
    migratedAt: new Date().toISOString(),
    adminId: userId,
    filesMigrated: migrated,
  });

  console.log(`[users] Migrated ${migrated} config files for admin ${userId}`);
}

module.exports = {
  getUser,
  upsertUser,
  listUsers,
  setUserRole,
  migrateAdminConfig,
};
