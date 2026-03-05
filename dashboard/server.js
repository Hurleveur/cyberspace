require('dotenv').config();

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');
const path = require('path');
const fsp = require('fs').promises;

const fm = require('./lib/fileManager');
const { fetchAllFeeds, fetchSingleFeed } = require('./lib/rssFetcher');
const notion = require('./lib/notionClient');

const PORT = process.env.PORT || 3000;
const FEED_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// --- Express app ---
const app = express();
app.use(express.json());
app.use(express.text());
app.use(express.static(path.join(__dirname, 'public')));

// --- File API ---

// GET /api/file?path=relative/path.md
app.get('/api/file', async (req, res) => {
  try {
    const result = await fm.readFile(req.query.path);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.type('text/plain').send(result.content);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// PUT /api/file?path=relative/path.md  (body = raw text)
app.put('/api/file', async (req, res) => {
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
app.post('/api/file/append', async (req, res) => {
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

// GET /api/reports — list all report dates
app.get('/api/reports', async (req, res) => {
  try {
    res.json(await fm.listReportDates());
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
app.post('/api/feeds/refresh', async (req, res) => {
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

// --- Feedback API ---

// --- Notion API ---

// GET /api/notion/config — returns whether Notion credentials are present
app.get('/api/notion/config', (req, res) => {
  res.json({ configured: notion.isConfigured() });
});

// GET /api/notion/tasks — fetch all tasks from Notion
app.get('/api/notion/tasks', async (req, res) => {
  try {
    const result = await notion.fetchTasks();
    if (result.error) return res.status(503).json({ error: result.error });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notion/tasks  (body = task object)
app.post('/api/notion/tasks', async (req, res) => {
  try {
    const result = await notion.createTask(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notion/tasks/:id  (body = partial task object)
app.patch('/api/notion/tasks/:id', async (req, res) => {
  try {
    const result = await notion.updateTask(req.params.id, req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notion/tasks/:id  — archives the task in Notion
app.delete('/api/notion/tasks/:id', async (req, res) => {
  try {
    const result = await notion.archiveTask(req.params.id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Settings API ---

// POST /api/settings  (body = { notion_token?: string, notion_db_id?: string })
// Writes values into .env and hot-reloads them into process.env.
app.post('/api/settings', async (req, res) => {
  const { notion_token, notion_db_id } = req.body || {};

  if (notion_token !== undefined && notion_token.trim() !== '' &&
      !/^secret_[A-Za-z0-9_-]+$/.test(notion_token.trim())) {
    return res.status(400).json({ error: 'Invalid token format — must start with "secret_"' });
  }
  // Accept both plain UUID and UUID without dashes
  if (notion_db_id !== undefined && notion_db_id.trim() !== '' &&
      !/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(notion_db_id.trim())) {
    return res.status(400).json({ error: 'Invalid database ID format — UUID expected' });
  }

  try {
    const envPath = path.join(__dirname, '.env');
    let content = '';
    try { content = await fsp.readFile(envPath, 'utf8'); } catch { /* file may not exist yet */ }

    if (notion_token !== undefined) {
      content = upsertEnvVar(content, 'NOTION_TOKEN', notion_token.trim());
      process.env.NOTION_TOKEN = notion_token.trim();
    }
    if (notion_db_id !== undefined) {
      content = upsertEnvVar(content, 'NOTION_DATABASE_ID', notion_db_id.trim());
      process.env.NOTION_DATABASE_ID = notion_db_id.trim();
    }

    await fsp.writeFile(envPath, content, 'utf8');
    notion.resetClient();
    res.json({ ok: true, configured: notion.isConfigured() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function upsertEnvVar(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  return content.trimEnd() + '\n' + line + '\n';
}

// POST /api/feedback  (body = { text: "..." })
app.post('/api/feedback', async (req, res) => {
  try {
    const text = req.body?.text || (typeof req.body === 'string' ? req.body : '');
    if (!text.trim()) return res.status(400).json({ error: 'Empty feedback' });

    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- [${timestamp}] ${text.trim()}\n`;
    const result = await fm.appendFile('feedback.md', entry);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// --- HTTP server + WebSocket ---

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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

// --- File watcher ---

const watcher = chokidar.watch(fm.PROJECT_ROOT, {
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

      // rss.md changed → force-refresh feeds immediately
      if (rel === 'rss.md') {
        console.log('[feeds] rss.md changed — triggering feed refresh');
        refreshFeedsQuietly();
      }
    }
  } catch (err) {
    console.error('[watcher] Error in file watcher callback:', err.message);
  }
});

// --- Periodic feed refresh ---

let feedRefreshTimer = null;

async function refreshFeedsQuietly() {
  try {
    const result = await fetchAllFeeds(true);
    broadcast({ type: 'feeds_updated', count: result.items.length, new: result.items.length });
    console.log(`[feeds] Refreshed: ${result.items.length} items, ${result.errors.length} errors`);
  } catch (err) {
    console.error('[feeds] Refresh error:', err.message);
  }
}

// --- Start ---

server.listen(PORT, () => {
  console.log(`\n  Cyberspace Dashboard`);
  console.log(`  http://localhost:${PORT}\n`);

  // Initial feed fetch
  refreshFeedsQuietly();

  // Schedule periodic refresh
  feedRefreshTimer = setInterval(refreshFeedsQuietly, FEED_REFRESH_INTERVAL_MS);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  clearInterval(feedRefreshTimer);
  clearInterval(heartbeatInterval);
  watcher.close();
  wss.close();
  server.close(() => process.exit(0));
});
