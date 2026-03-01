const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');
const path = require('path');

const fm = require('./lib/fileManager');
const { fetchAllFeeds } = require('./lib/rssFetcher');

const PORT = process.env.PORT || 3000;
const FEED_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// --- Express app ---
const app = express();
app.use(express.json());
app.use(express.text());
app.use(express.static(path.join(__dirname, 'public')));

// --- File API ---

// GET /api/file?path=relative/path.md
app.get('/api/file', (req, res) => {
  const result = fm.readFile(req.query.path);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.type('text/plain').send(result.content);
});

// PUT /api/file?path=relative/path.md  (body = raw text)
app.put('/api/file', (req, res) => {
  const content = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const result = fm.writeFile(req.query.path, content);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json({ ok: true });
});

// POST /api/file/append?path=relative/path.md  (body = raw text)
app.post('/api/file/append', (req, res) => {
  const content = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const result = fm.appendFile(req.query.path, content);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json({ ok: true });
});

// --- Reports API ---

// GET /api/reports — list all report dates
app.get('/api/reports', (req, res) => {
  res.json(fm.listReportDates());
});

// GET /api/reports/latest — most recent report date
app.get('/api/reports/latest', (req, res) => {
  const date = fm.latestReportDate();
  if (!date) return res.status(404).json({ error: 'No reports found' });
  res.json({ date });
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

// --- Feedback API ---

// POST /api/feedback  (body = { text: "..." })
app.post('/api/feedback', (req, res) => {
  const text = req.body?.text || (typeof req.body === 'string' ? req.body : '');
  if (!text.trim()) return res.status(400).json({ error: 'Empty feedback' });

  const timestamp = new Date().toISOString().split('T')[0];
  const entry = `\n- [${timestamp}] ${text.trim()}\n`;
  const result = fm.appendFile('feedback.md', entry);
  if (result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json({ ok: true });
});

// --- HTTP server + WebSocket ---

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(msg);
    }
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
  awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
});

watcher.on('all', (event, filePath) => {
  const rel = path.relative(fm.PROJECT_ROOT, filePath).replace(/\\/g, '/');
  if (['add', 'change'].includes(event)) {
    broadcast({ type: 'file_changed', file: rel, action: event === 'add' ? 'created' : 'modified' });
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
  watcher.close();
  wss.close();
  server.close(() => process.exit(0));
});
