/**
 * Turso (libSQL) database storage backend.
 * Same interface as blobStorage: readFile, writeFile, appendFile,
 * listReportDates, invalidateCache.
 *
 * Only loaded when process.env.VERCEL is set.
 * Internally maps file-path-based operations to SQL table queries.
 *
 * Path routing:
 *   users/{id}/config/{name}.md  → user_configs table
 *   users/{id}/data/feed-cache.json → feed_caches table
 *   reports/{date}/{file}        → reports table
 *   config/feedback.md (append)  → feedback table (INSERT)
 *   config/feedback.md (read)    → feedback table (SELECT + concat)
 *   data/projects.json           → projects table
 *   users.json                   → users table (JSON compat)
 */
const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || '',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
});

// --- Schema auto-init ---

let _initialized = false;

async function ensureSchema() {
  if (_initialized) return;
  await client.batch([
    `CREATE TABLE IF NOT EXISTS users (
      github_id  TEXT PRIMARY KEY,
      login      TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'user',
      avatar     TEXT,
      created_at TEXT NOT NULL,
      last_login TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS user_configs (
      user_id     TEXT NOT NULL,
      config_name TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      updated_at  TEXT NOT NULL,
      PRIMARY KEY (user_id, config_name)
    )`,
    `CREATE TABLE IF NOT EXISTS feed_caches (
      user_id    TEXT PRIMARY KEY,
      items_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS reports (
      report_date TEXT NOT NULL,
      filename    TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      PRIMARY KEY (report_date, filename)
    )`,
    `CREATE TABLE IF NOT EXISTS feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_login TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id        TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS migrations (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      created_at TEXT NOT NULL
    )`,
  ]);
  _initialized = true;
}

// --- In-memory cache (same pattern as blobStorage) ---

const CACHE_TTL = 60_000; // 1 minute
const _cache = new Map(); // path → { content, expiresAt }

function getCached(path) {
  const cached = _cache.get(path);
  if (cached && Date.now() < cached.expiresAt) return cached.content;
  return undefined;
}

function setCache(path, content) {
  _cache.set(path, { content, expiresAt: Date.now() + CACHE_TTL });
}

// --- Path parsing helpers ---

// users/{id}/config/{name}.md
const USER_CONFIG_RE = /^users\/([^/]+)\/config\/(.+)\.md$/;
// users/{id}/data/feed-cache.json
const FEED_CACHE_RE = /^users\/([^/]+)\/data\/feed-cache\.json$/;
// reports/{date}/{file}
const REPORT_RE = /^reports\/(\d{4}-\d{2}-\d{2})\/(.+)$/;

function parseUserConfig(path) {
  const m = path.match(USER_CONFIG_RE);
  return m ? { userId: m[1], configName: m[2] } : null;
}

function parseFeedCache(path) {
  const m = path.match(FEED_CACHE_RE);
  return m ? { userId: m[1] } : null;
}

function parseReport(path) {
  const m = path.match(REPORT_RE);
  return m ? { date: m[1], filename: m[2] } : null;
}

// --- readFile ---

async function readFile(relativePath) {
  const cached = getCached(relativePath);
  if (cached !== undefined) return { content: cached };

  await ensureSchema();

  try {
    // 1. User config: users/{id}/config/{name}.md
    const uc = parseUserConfig(relativePath);
    if (uc) {
      const result = await client.execute({
        sql: 'SELECT content FROM user_configs WHERE user_id = ? AND config_name = ?',
        args: [uc.userId, uc.configName],
      });
      if (result.rows.length === 0) return { error: 'Not found', status: 404 };
      const content = String(result.rows[0].content);
      setCache(relativePath, content);
      return { content };
    }

    // 2. Feed cache: users/{id}/data/feed-cache.json
    const fc = parseFeedCache(relativePath);
    if (fc) {
      const result = await client.execute({
        sql: 'SELECT items_json FROM feed_caches WHERE user_id = ?',
        args: [fc.userId],
      });
      if (result.rows.length === 0) return { error: 'Not found', status: 404 };
      const content = String(result.rows[0].items_json);
      setCache(relativePath, content);
      return { content };
    }

    // 3. Reports: reports/{date}/{file}
    const rpt = parseReport(relativePath);
    if (rpt) {
      const result = await client.execute({
        sql: 'SELECT content FROM reports WHERE report_date = ? AND filename = ?',
        args: [rpt.date, rpt.filename],
      });
      if (result.rows.length === 0) return { error: 'Not found', status: 404 };
      const content = String(result.rows[0].content);
      setCache(relativePath, content);
      return { content };
    }

    // 4. Feedback: config/feedback.md
    if (relativePath === 'config/feedback.md') {
      const result = await client.execute(
        'SELECT user_login, content, created_at FROM feedback ORDER BY created_at DESC'
      );
      if (result.rows.length === 0) return { error: 'Not found', status: 404 };
      const lines = result.rows.map(r =>
        `- [${String(r.created_at).split('T')[0]}] (${r.user_login}) ${r.content}`
      );
      const content = lines.join('\n') + '\n';
      setCache(relativePath, content);
      return { content };
    }

    // 5. Projects: data/projects.json
    if (relativePath === 'data/projects.json') {
      const result = await client.execute('SELECT id, data_json FROM projects');
      if (result.rows.length === 0) return { error: 'Not found', status: 404 };
      const projects = result.rows.map(r => {
        const data = JSON.parse(String(r.data_json));
        return { id: r.id, ...data };
      });
      const content = JSON.stringify(projects, null, 2);
      setCache(relativePath, content);
      return { content };
    }

    // 6. Users registry: users.json (backward compat for users.js)
    if (relativePath === 'users.json') {
      const result = await client.execute('SELECT * FROM users');
      const usersObj = {};
      for (const row of result.rows) {
        usersObj[String(row.github_id)] = {
          login: row.login,
          role: row.role,
          avatar: row.avatar || null,
          createdAt: row.created_at,
          lastLogin: row.last_login,
        };
      }
      const content = JSON.stringify({ users: usersObj }, null, 2);
      setCache(relativePath, content);
      return { content };
    }

    // 7. Migration marker
    if (relativePath === 'migration-v2.json') {
      const result = await client.execute({
        sql: "SELECT value FROM migrations WHERE key = ?",
        args: ['migration-v2'],
      });
      if (result.rows.length === 0) return { error: 'Not found', status: 404 };
      const content = String(result.rows[0].value);
      setCache(relativePath, content);
      return { content };
    }

    return { error: 'Not found', status: 404 };
  } catch (err) {
    console.error('[dbStorage:read]', relativePath, err.message);
    return { error: err.message, status: 500 };
  }
}

// --- writeFile ---

async function writeFile(relativePath, content) {
  await ensureSchema();

  try {
    const now = new Date().toISOString();

    // 1. User config
    const uc = parseUserConfig(relativePath);
    if (uc) {
      await client.execute({
        sql: `INSERT OR REPLACE INTO user_configs (user_id, config_name, content, updated_at)
              VALUES (?, ?, ?, ?)`,
        args: [uc.userId, uc.configName, content, now],
      });
      setCache(relativePath, content);
      return { ok: true };
    }

    // 2. Feed cache
    const fc = parseFeedCache(relativePath);
    if (fc) {
      await client.execute({
        sql: `INSERT OR REPLACE INTO feed_caches (user_id, items_json, updated_at)
              VALUES (?, ?, ?)`,
        args: [fc.userId, content, now],
      });
      setCache(relativePath, content);
      return { ok: true };
    }

    // 3. Reports
    const rpt = parseReport(relativePath);
    if (rpt) {
      await client.execute({
        sql: `INSERT OR REPLACE INTO reports (report_date, filename, content, created_at)
              VALUES (?, ?, ?, ?)`,
        args: [rpt.date, rpt.filename, content, now],
      });
      setCache(relativePath, content);
      return { ok: true };
    }

    // 4. Feedback (write replaces all — used when clearing feedback)
    if (relativePath === 'config/feedback.md') {
      // If content is empty/template, clear all feedback
      if (!content.trim() || content.trim().startsWith('#')) {
        await client.execute('DELETE FROM feedback');
      }
      _cache.delete(relativePath);
      return { ok: true };
    }

    // 5. Projects
    if (relativePath === 'data/projects.json') {
      const projects = JSON.parse(content);
      const arr = Array.isArray(projects) ? projects : [];
      const tx = await client.transaction('write');
      try {
        await tx.execute('DELETE FROM projects');
        for (const p of arr) {
          const { id, ...rest } = p;
          await tx.execute({
            sql: 'INSERT INTO projects (id, data_json, updated_at) VALUES (?, ?, ?)',
            args: [id, JSON.stringify(rest), now],
          });
        }
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw e;
      }
      setCache(relativePath, content);
      return { ok: true };
    }

    // 6. Users registry (backward compat — full JSON write)
    if (relativePath === 'users.json') {
      const data = JSON.parse(content);
      const usersObj = data.users || {};
      const tx = await client.transaction('write');
      try {
        await tx.execute('DELETE FROM users');
        for (const [id, u] of Object.entries(usersObj)) {
          await tx.execute({
            sql: `INSERT INTO users (github_id, login, role, avatar, created_at, last_login)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [id, u.login, u.role, u.avatar || null, u.createdAt, u.lastLogin],
          });
        }
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw e;
      }
      setCache(relativePath, content);
      return { ok: true };
    }

    // 7. Migration marker
    if (relativePath === 'migration-v2.json') {
      await client.execute({
        sql: `INSERT OR REPLACE INTO migrations (key, value, created_at) VALUES (?, ?, ?)`,
        args: ['migration-v2', content, now],
      });
      setCache(relativePath, content);
      return { ok: true };
    }

    return { error: 'Unknown path', status: 400 };
  } catch (err) {
    console.error('[dbStorage:write]', relativePath, err.message);
    return { error: err.message, status: 500 };
  }
}

// --- appendFile ---

async function appendFile(relativePath, content) {
  await ensureSchema();

  try {
    // Feedback: INSERT a new row instead of read-modify-write
    if (relativePath === 'config/feedback.md') {
      // Parse the entry format: "- [date] (login) text"
      const match = content.match(/\[([^\]]+)\]\s*\(([^)]+)\)\s*(.*)/s);
      const now = new Date().toISOString();
      const login = match ? match[2] : 'unknown';
      const text = match ? match[3].trim() : content.trim();
      await client.execute({
        sql: 'INSERT INTO feedback (user_login, content, created_at) VALUES (?, ?, ?)',
        args: [login, text, now],
      });
      _cache.delete(relativePath);
      return { ok: true };
    }

    // For other paths: read + append + write (same as blob did)
    const existing = await readFile(relativePath);
    if (existing.error && existing.status !== 404) return existing;
    const combined = (existing.content || '') + content;
    return writeFile(relativePath, combined);
  } catch (err) {
    console.error('[dbStorage:append]', relativePath, err.message);
    return { error: err.message, status: 500 };
  }
}

// --- listReportDates ---

async function listReportDates() {
  await ensureSchema();
  try {
    const result = await client.execute(
      'SELECT DISTINCT report_date FROM reports ORDER BY report_date DESC'
    );
    const dates = result.rows.map(r => String(r.report_date));
    return { dates };
  } catch (err) {
    console.error('[dbStorage] listReportDates error:', err.message);
    return { dates: [] };
  }
}

// --- invalidateCache ---

function invalidateCache(relativePath) {
  if (relativePath) {
    _cache.delete(relativePath);
  }
}

// --- Direct typed methods for users.js ---

async function getUser(id) {
  await ensureSchema();
  const result = await client.execute({
    sql: 'SELECT * FROM users WHERE github_id = ?',
    args: [String(id)],
  });
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    id: r.github_id,
    login: r.login,
    role: r.role,
    avatar: r.avatar || null,
    createdAt: r.created_at,
    lastLogin: r.last_login,
  };
}

async function upsertUser(id, data) {
  await ensureSchema();
  const now = new Date().toISOString();
  const key = String(id);

  // Try to get existing user for createdAt
  const existing = await getUser(key);
  const createdAt = existing?.createdAt || now;

  await client.execute({
    sql: `INSERT OR REPLACE INTO users (github_id, login, role, avatar, created_at, last_login)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [key, data.login, data.role, data.avatar || null, createdAt, now],
  });

  _cache.delete('users.json');
  return {
    id: key,
    login: data.login,
    role: data.role,
    avatar: data.avatar || null,
    createdAt,
    lastLogin: now,
  };
}

async function listUsers() {
  await ensureSchema();
  const result = await client.execute('SELECT * FROM users');
  return result.rows.map(r => ({
    id: r.github_id,
    login: r.login,
    role: r.role,
    avatar: r.avatar || null,
    createdAt: r.created_at,
    lastLogin: r.last_login,
  }));
}

async function setUserRole(id, role) {
  await ensureSchema();
  const key = String(id);
  const result = await client.execute({
    sql: 'UPDATE users SET role = ? WHERE github_id = ?',
    args: [role, key],
  });
  if (result.rowsAffected === 0) return null;
  _cache.delete('users.json');
  return getUser(key);
}

async function getMigrationMarker(key) {
  await ensureSchema();
  const result = await client.execute({
    sql: 'SELECT value FROM migrations WHERE key = ?',
    args: [key],
  });
  if (result.rows.length === 0) return null;
  return JSON.parse(String(result.rows[0].value));
}

async function setMigrationMarker(key, value) {
  await ensureSchema();
  await client.execute({
    sql: 'INSERT OR REPLACE INTO migrations (key, value, created_at) VALUES (?, ?, ?)',
    args: [key, JSON.stringify(value), new Date().toISOString()],
  });
}

module.exports = {
  // Path-based interface (same as blobStorage)
  readFile,
  writeFile,
  appendFile,
  listReportDates,
  invalidateCache,
  // Direct typed methods (for users.js)
  getUser,
  upsertUser,
  listUsers,
  setUserRole,
  getMigrationMarker,
  setMigrationMarker,
};
