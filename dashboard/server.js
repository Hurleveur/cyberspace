const express = require('express');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');
const path = require('path');

const fm = require('./lib/fileManager');
const { fetchAllFeeds, fetchSingleFeed } = require('./lib/rssFetcher');

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

// --- Search API ---

// GET /api/search?q= — full-text search across all briefing reports
app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query || query.length < 2) return res.json([]);

  const { dates } = fm.listReportDates();
  const results = [];
  for (const date of dates) {
    const r = fm.readFile(`reports/${date}/briefing.md`);
    if (r.error) continue;
    const lines = r.content.split('\n');
    let currentSection = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^## /.test(line)) currentSection = line.replace(/^#+\s*/, '').replace(/[🔴🟠🟡🟢]/gu, '').trim();
      if (line.toLowerCase().includes(query)) {
        results.push({ date, section: currentSection, context: line.slice(0, 120).trim(), lineNum: i + 1 });
      }
    }
  }
  res.json(results);
});

// --- Proxy API ---

// SSRF check — block private/loopback IPs
function isPrivateHost(hostname) {
  return /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname);
}

// Fetch a URL using Node built-ins (no new packages); follows one redirect
function fetchUrl(url, redirectsLeft = 2) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error('Invalid URL')); }
    if (!['http:', 'https:'].includes(u.protocol)) return reject(new Error('Only http/https allowed'));
    if (isPrivateHost(u.hostname)) return reject(Object.assign(new Error('Blocked'), { code: 'BLOCKED' }));

    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Cyberspace/1.0)' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : `${u.origin}${res.headers.location}`;
        return fetchUrl(next, redirectsLeft - 1).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; if (data.length > 500000) req.destroy(); });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Extract readable article text from raw HTML
function extractArticle(html) {
  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Try semantic containers in priority order
  let block = '';
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) { block = articleMatch[1]; }
  else {
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) { block = mainMatch[1]; }
    else {
      // Find longest <div> block
      let best = '';
      const divRe = /<div[^>]*>([\s\S]{500,}?)<\/div>/gi;
      let m;
      while ((m = divRe.exec(html)) !== null) { if (m[1].length > best.length) best = m[1]; }
      block = best || html;
    }
  }

  // Strip tags, decode entities, normalise whitespace
  let text = block
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (text.length > 8000) text = text.slice(0, 8000) + '…';
  return { title: title.replace(/&amp;/g, '&').replace(/&#39;/g, "'"), text };
}

// GET /api/proxy?url= — fetch external article and return extracted text
app.get('/api/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Missing or invalid url parameter' });

  try {
    const html = await fetchUrl(url);
    const { title, text } = extractArticle(html);
    res.json({ title, text, url });
  } catch (err) {
    if (err.code === 'BLOCKED') return res.status(403).json({ error: 'Blocked: private network address' });
    if (err.message === 'Timeout') return res.status(504).json({ error: 'Request timed out' });
    res.status(502).json({ error: err.message });
  }
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
