require('dotenv').config();

// --- Auth (production only) ---
// Set AUTH_TOKEN in Vercel environment variables. If unset, auth is skipped (local dev).
const AUTH_TOKEN = process.env.AUTH_TOKEN || null;

function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token || '');
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Config files require auth even for reads (personal profile data)
function requireAuthForConfig(req, res, next) {
  const p = String(req.query.path || '');
  if (!AUTH_TOKEN || !p.startsWith('config/')) return next();
  return requireAuth(req, res, next);
}

const express = require('express');
const http    = require('http');
const https   = require('https');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');
const path = require('path');
const fs   = require('fs');
const { randomUUID } = require('crypto');

const fm = require('./lib/storage');
const { fetchAllFeeds, fetchSingleFeed } = require('./lib/rssFetcher');

const HTTP_PORT  = process.env.HTTP_PORT  || process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 4444;
const CERT_DIR   = path.join(__dirname, 'certs');
const CERT_FILE  = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE   = path.join(CERT_DIR, 'key.pem');
const FEED_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

const DEFAULT_MAP_CENTER = [20, 0];

function parseMapCenter(raw) {
  if (!raw || typeof raw !== 'string') return DEFAULT_MAP_CENTER;
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 2) return DEFAULT_MAP_CENTER;
  const [lat, lng] = parts;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return DEFAULT_MAP_CENTER;
  if (lat < -85 || lat > 85 || lng < -180 || lng > 180) return DEFAULT_MAP_CENTER;
  return [lat, lng];
}

const MAP_CENTER = parseMapCenter(process.env.MAP_CENTER);

// --- Express app ---
const app = express();
app.use(express.json());
app.use(express.text());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json({ mapCenter: MAP_CENTER, serverless: !!process.env.VERCEL });
});

// --- File API ---

// GET /api/file?path=relative/path.md
app.get('/api/file', requireAuthForConfig, async (req, res) => {
  try {
    const result = await fm.readFile(req.query.path);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.type('text/plain').send(result.content);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// PUT /api/file?path=relative/path.md  (body = raw text)
app.put('/api/file', requireAuth, async (req, res) => {
  try {
    const content = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const result = await fm.writeFile(req.query.path, content);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/file/append?path=relative/path.md  (body = raw text)
app.post('/api/file/append', requireAuth, async (req, res) => {
  try {
    const content = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const result = await fm.appendFile(req.query.path, content);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// --- Reports API ---

// GET /api/reports — list all report dates, plus a per-date file manifest
// filesByDate lets clients skip fetching optional files that don't exist,
// avoiding unnecessary 404 console errors.
app.get('/api/reports', async (req, res) => {
  try {
    const { dates } = await fm.listReportDates();
    const OPTIONAL_FILES = ['events.md', 'markers.json', 'announcement.md'];
    const filesByDate = {};
    await Promise.all(dates.map(async (date) => {
      const checks = await Promise.all(OPTIONAL_FILES.map(async (f) => {
        const r = await fm.readFile(`reports/${date}/${f}`);
        return [f, !r.error];
      }));
      filesByDate[date] = Object.fromEntries(checks);
    }));
    res.json({ dates, filesByDate });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/reports/latest — most recent report date
app.get('/api/reports/latest', async (req, res) => {
  try {
    const date = await fm.latestReportDate();
    if (!date) return res.status(404).json({ error: 'No reports found' });
    res.json({ date });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/reports/announcement — announcement.md for a specific or latest report
app.get('/api/reports/announcement', async (req, res) => {
  try {
    let date = Array.isArray(req.query.date) ? req.query.date[0] : req.query.date;
    if (date !== undefined) {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid date parameter' });
      }
    } else {
      date = await fm.latestReportDate();
    }
    if (!date) return res.status(404).json({ error: 'No reports found' });
    const result = await fm.readFile(`reports/${date}/announcement.md`);
    if (result.error) return res.status(404).json({ error: 'No announcement for this report' });
    res.json({ date, content: result.content });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// GET /api/reports/announcements — all announcement.md files across all report dates, sorted oldest-first
app.get('/api/reports/announcements', async (req, res) => {
  try {
    const { dates } = await fm.listReportDates();
    // dates is newest-first; we want oldest-first for numbered display
    const sorted = [...dates].reverse();
    const results = [];
    for (const d of sorted) {
      const result = await fm.readFile(`reports/${d}/announcement.md`);
      if (!result.error) results.push({ date: d, content: result.content });
    }
    res.json({ announcements: results });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/reports/sync — upload report files to blob storage (for syncing local → Vercel)
// Body: { date: "2026-03-07", files: { "briefing.md": "...", "markers.json": "...", ... } }
app.post('/api/reports/sync', requireAuth, express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const { date, files } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid or missing date (YYYY-MM-DD)' });
    }
    if (!files || typeof files !== 'object') {
      return res.status(400).json({ error: 'Missing files object' });
    }

    const results = [];
    for (const [filename, content] of Object.entries(files)) {
      if (typeof content !== 'string') continue;
      const filePath = `reports/${date}/${filename}`;
      const result = await fm.writeFile(filePath, content);
      results.push({ file: filename, ok: !result.error, error: result.error });
    }

    res.json({ date, synced: results });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

// --- Feeds API ---

// GET /api/feeds — return cached/fresh RSS feed items
app.get('/api/feeds', async (req, res) => {
  try {
    const result = await fetchAllFeeds();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/feeds/refresh — force re-fetch
app.post('/api/feeds/refresh', requireAuth, async (req, res) => {
  try {
    const result = await fetchAllFeeds(true);
    // Notify WebSocket clients
    broadcast({ type: 'feeds_updated', count: result.items.length, new: result.items.length });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Search API ---

// GET /api/search?q= — full-text search across all briefing reports (async with cache)
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query || query.length < 2) return res.json([]);

  const { dates } = await fm.listReportDates();
  const results = [];

  // Fetch all briefings in parallel (cached after first read)
  const briefings = await Promise.all(dates.map(async (date) => {
    const r = await fm.readFile(`reports/${date}/briefing.md`);
    return r.error ? null : { date, content: r.content };
  }));

  for (const b of briefings) {
    if (!b) continue;
    const lines = b.content.split('\n');
    let currentSection = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^## /.test(line)) currentSection = line.replace(/^#+\s*/, '').replace(/[🔴🟠🟡🟢]/gu, '').trim();
      if (line.toLowerCase().includes(query)) {
        results.push({ date: b.date, section: currentSection, context: line.slice(0, 120).trim(), lineNum: i + 1 });
      }
    }
  }
  res.json(results);
});

// GET /api/feeds/test?url= — test a single RSS feed URL
app.get('/api/feeds/test', async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ ok: false, error: 'Invalid URL' });
  try {
    const result = await fetchSingleFeed({ url, category: 'Test', priority: 'MEDIUM' });
    if (result.error) return res.json({ ok: false, error: result.error.message || String(result.error) });
    const first = result.items[0];
    res.json({ ok: true, feedTitle: first?.source || url, count: result.items.length, sampleTitle: first?.title || null });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// --- Projects API ---

const PROJECTS_PATH = 'data/projects.json';

async function readProjects() {
  try {
    const result = await fm.readFile(PROJECTS_PATH);
    if (result.error) return [];
    return JSON.parse(result.content);
  } catch {
    return [];
  }
}

async function writeProjects(projects) {
  await fm.writeFile(PROJECTS_PATH, JSON.stringify(projects, null, 2));
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, '').trim();
}

function detectUrlType(url) {
  const hash = url.includes('#') ? url.split('#')[1] : url;
  if (/\/embed\//.test(hash)) return 'embed';
  if (/\/view\//.test(hash))  return 'view';
  if (/\/edit\//.test(hash))  return 'edit';
  return 'unknown';
}

function validateProjectInput(body) {
  const { name, cryptpadUrl, description, members, color } = body || {};

  const cleanName = stripHtml(name || '').slice(0, 64);
  if (!cleanName) return { error: 'Project name is required.' };

  const cleanUrl = String(cryptpadUrl || '').trim();
  if (!cleanUrl) return { error: 'CryptPad URL is required.' };
  if (!/^https:\/\/cryptpad\.fr\//.test(cleanUrl))
    return { error: 'URL must be a CryptPad link (https://cryptpad.fr/...).' };

  const urlType = detectUrlType(cleanUrl);

  const cleanDesc = description ? stripHtml(description).slice(0, 256) : null;

  const rawMembers = Array.isArray(members)
    ? members
    : typeof members === 'string'
      ? members.split(',')
      : [];
  const cleanMembers = rawMembers
    .map(m => stripHtml(m).slice(0, 32))
    .filter(Boolean)
    .slice(0, 20);

  const allowedColors = ['#00ff41', '#00bfff', '#ff6b35', '#e74c3c', '#f1c40f', '#9b59b6'];
  const cleanColor = allowedColors.includes(color) ? color : '#00ff41';

  return {
    data: {
      name: cleanName,
      cryptpadUrl: cleanUrl,
      urlType,
      description: cleanDesc,
      members: cleanMembers,
      color: cleanColor,
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await readProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects
app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    const validated = validateProjectInput(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });

    const projects = await readProjects();
    const now = new Date().toISOString();
    const project = { id: randomUUID(), ...validated.data, createdAt: now, updatedAt: now };
    projects.push(project);
    await writeProjects(projects);
    broadcast({ type: 'projects_updated' });
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id
app.put('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid project ID.' });

    const validated = validateProjectInput(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });

    const projects = await readProjects();
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Project not found.' });

    projects[idx] = { ...projects[idx], ...validated.data, updatedAt: new Date().toISOString() };
    await writeProjects(projects);
    broadcast({ type: 'projects_updated' });
    res.json(projects[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/check-embed?url=...
// Makes a server-side HEAD request to the given CryptPad URL (base, no hash)
// and returns the iframe security headers so the client can explain embed failures.
app.get('/api/projects/check-embed', async (req, res) => {
  const rawUrl = String(req.query.url || '').trim();
  // Strict SSRF guard — only allow cryptpad.fr
  if (!rawUrl || !/^https:\/\/cryptpad\.fr\/[a-zA-Z0-9/_-]*$/.test(rawUrl.split('#')[0])) {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  const baseUrl = rawUrl.split('#')[0]; // hash is never sent in HTTP requests
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(baseUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 CyberspaceBot/1.0' },
    });
    clearTimeout(tid);

    const xfo = response.headers.get('x-frame-options') || null;
    const csp = response.headers.get('content-security-policy') || null;
    const frameAncestors = csp
      ? (csp.match(/frame-ancestors\s+([^;]+)/)?.[1]?.trim() || null)
      : null;

    // Does the CSP allow any https:// origin to embed? ('https:' wildcard)
    const httpsAllowed = frameAncestors ? /\bhttps:\b/.test(frameAncestors) : false;

    // canEmbed is true only if there are no frame restrictions
    const blocked = xfo
      ? (xfo.toUpperCase() === 'DENY' || xfo.toUpperCase() === 'SAMEORIGIN')
      : (frameAncestors && !frameAncestors.includes('*') && !httpsAllowed && !frameAncestors.match(/\bhttp:\/\/localhost/));

    res.json({
      canEmbed: !blocked,
      httpsOnly: !blocked ? false : httpsAllowed,
      xFrameOptions: xfo,
      frameAncestors,
      statusCode: response.status,
    });
  } catch (err) {
    res.json({ canEmbed: false, error: err.name === 'AbortError' ? 'Request timed out' : err.message });
  }
});

// DELETE /api/projects/:id
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid project ID.' });

    const projects = await readProjects();
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Project not found.' });

    projects.splice(idx, 1);
    await writeProjects(projects);
    broadcast({ type: 'projects_updated' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Data Export / Import API ---

// GET /api/data/export — server-side data snapshot for backup
app.get('/api/data/export', async (req, res) => {
  try {
    const projects = await readProjects();
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data/import — restore server-side data from backup
// body: { projects: [...], mode: 'merge' | 'replace' }
app.post('/api/data/import', requireAuth, async (req, res) => {
  try {
    const rawProjects = req.body?.projects;
    const mode = /^replace$/i.test(String(req.body?.mode || '')) ? 'replace' : 'merge';

    if (!Array.isArray(rawProjects)) {
      return res.json({ ok: true, projectsImported: 0 });
    }

    // Validate and sanitize every project through the existing input validator
    const validated = [];
    for (const p of rawProjects) {
      const result = validateProjectInput(p);
      if (!result.error) {
        validated.push({
          id:        UUID_RE.test(p.id) ? p.id : randomUUID(),
          ...result.data,
          createdAt: (typeof p.createdAt === 'string' && p.createdAt) ? p.createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    if (mode === 'replace') {
      await writeProjects(validated);
    } else {
      const existing    = await readProjects();
      const existingIds = new Set(existing.map(p => p.id));
      const toAdd       = validated.filter(p => !existingIds.has(p.id));
      await writeProjects([...existing, ...toAdd]);
    }

    broadcast({ type: 'projects_updated' });
    res.json({ ok: true, projectsImported: validated.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Feedback API ---

// POST /api/feedback  (body = { text: "..." })
app.post('/api/feedback', requireAuth, async (req, res) => {
  try {
    const text = req.body?.text || (typeof req.body === 'string' ? req.body : '');
    if (!text.trim()) return res.status(400).json({ error: 'Empty feedback' });

    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- [${timestamp}] ${text.trim()}\n`;
    const result = await fm.appendFile('config/feedback.md', entry);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// --- Server + WebSocket (HTTPS when certs exist, HTTP otherwise) ---

let tlsOptions = null;
try {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    tlsOptions = {
      cert: fs.readFileSync(CERT_FILE),
      key:  fs.readFileSync(KEY_FILE),
    };
  }
} catch (err) {
  console.warn('[https] Could not load TLS certificates:', err.message);
}

const serverPort = tlsOptions ? HTTPS_PORT : HTTP_PORT;
const server     = tlsOptions ? https.createServer(tlsOptions, app) : http.createServer(app);
const wss     = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

// Heartbeat: detect and clean up dead connections every 30s
const heartbeatInterval = setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) { ws.terminate(); clients.delete(ws); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// Debounced broadcast — batches messages within a 200ms window
let _broadcastQueue = [];
let _broadcastTimer = null;

function broadcast(data) {
  _broadcastQueue.push(data);
  if (!_broadcastTimer) {
    _broadcastTimer = setTimeout(() => {
      const batch = _broadcastQueue;
      _broadcastQueue = [];
      _broadcastTimer = null;
      // Send each message (or batch into a single array message)
      for (const item of batch) {
        const msg = JSON.stringify(item);
        for (const client of clients) {
          if (client.readyState === 1) client.send(msg);
        }
      }
    }, 200);
  }
}

// --- File watcher (local dev only — Vercel has no persistent filesystem) ---

let watcher = null;
let feedRefreshTimer = null;

if (!process.env.VERCEL) {
  watcher = chokidar.watch(fm.PROJECT_ROOT, {
    ignored: [
      /(^|[\/\\])\.(?!claude)/,  // Ignore dotfiles except .claude
      /node_modules/,
      /dashboard\//,             // Don't watch ourselves
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 500 },
  });

  watcher.on('all', (event, filePath) => {
    try {
      const rel = path.relative(fm.PROJECT_ROOT, filePath).replace(/\\/g, '/');

      // Invalidate file cache for changed files
      fm.invalidateCache(rel);

      if (['add', 'change'].includes(event)) {
        broadcast({ type: 'file_changed', file: rel, action: event === 'add' ? 'created' : 'modified' });

        // config/rss.md changed → force-refresh feeds immediately
        if (rel === 'config/rss.md') {
          console.log('[feeds] config/rss.md changed — triggering feed refresh');
          refreshFeedsQuietly();
        }
      }
    } catch (err) {
      console.error('[watcher] Error in file watcher callback:', err.message);
    }
  });
}

async function refreshFeedsQuietly() {
  try {
    const result = await fetchAllFeeds(true);
    broadcast({ type: 'feeds_updated', count: result.items.length, new: result.items.length });
    console.log(`[feeds] Refreshed: ${result.items.length} items, ${result.errors.length} errors`);
  } catch (err) {
    console.error('[feeds] Refresh error:', err.message);
  }
}

// --- HTTP → HTTPS redirect server (only active when HTTPS is on) ---

let redirectServer = null;
if (tlsOptions) {
  redirectServer = http.createServer((req, res) => {
    const host = (req.headers.host || `localhost:${HTTPS_PORT}`).replace(/:\d+$/, '');
    res.writeHead(301, { Location: `https://${host}:${HTTPS_PORT}${req.url}` });
    res.end();
  });
}

// --- Start ---

if (require.main === module) {
  // Local dev: start the server directly
  server.listen(serverPort, () => {
    const scheme = tlsOptions ? 'https' : 'http';
    console.log(`\n  Cyberspace Dashboard`);
    console.log(`  ${scheme}://localhost:${serverPort}`);
    if (!tlsOptions) {
      console.log(`  (run setup-https.ps1 once to enable HTTPS and CryptPad embeds)`);
    }
    console.log();

    // Initial feed fetch
    refreshFeedsQuietly();

    // Schedule periodic refresh
    feedRefreshTimer = setInterval(refreshFeedsQuietly, FEED_REFRESH_INTERVAL_MS);
  });

  if (redirectServer) {
    redirectServer.listen(HTTP_PORT, () => {
      console.log(`  http://localhost:${HTTP_PORT}  →  redirects to https://localhost:${HTTPS_PORT}\n`);
    });
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    clearInterval(feedRefreshTimer);
    clearInterval(heartbeatInterval);
    if (watcher) watcher.close();
    wss.close();
    if (redirectServer) redirectServer.close();
    server.close(() => process.exit(0));
  });
} else {
  // Serverless export (Vercel) — platform handles listening
  module.exports = app;
}
