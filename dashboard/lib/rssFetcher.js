const fs = require('fs');
const path = require('path');
const RssParser = require('rss-parser');

const { PROJECT_ROOT } = require('./fileManager');

const RSS_CONFIG_PATH = path.join(PROJECT_ROOT, 'rss.md');
const CACHE_TTL_MS = 15 * 60 * 1000;       // 15 minutes — in-memory freshness
const ITEM_MAX_AGE_MS = 7 * 24 * 3600000;  // 7 days — disk persistence TTL
const DISK_CACHE_PATH = path.join(__dirname, '..', 'data', 'feed-cache.json');

const parser = new RssParser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  timeout: 10000,
});

// ── Disk persistence ─────────────────────────────────────────────────────────

function loadDiskCache() {
  try {
    const raw = fs.readFileSync(DISK_CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDiskCache(items) {
  try {
    fs.mkdirSync(path.dirname(DISK_CACHE_PATH), { recursive: true });
    fs.writeFileSync(DISK_CACHE_PATH, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.error('[rssFetcher] Could not save disk cache:', err.message);
  }
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let cache = {
  items: loadDiskCache(),  // seed from disk on startup
  fetchedAt: 0,
  errors: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Stable ID based on the item's canonical URL + title.
 * No index suffix — survives reordering and server restarts.
 */
function stableId(url, title) {
  return `rss-${hashString((url || '') + '|' + (title || ''))}`;
}

/**
 * Parse rss.md to extract feed URLs with their category and priority.
 */
function parseRssConfig() {
  let content;
  try {
    content = fs.readFileSync(RSS_CONFIG_PATH, 'utf-8');
  } catch {
    return [];
  }

  const feeds = [];
  let currentCategory = 'Uncategorized';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^##\s+(.+)/);
    if (headingMatch) { currentCategory = headingMatch[1].trim(); continue; }
    const feedMatch = trimmed.match(/^-\s+(https?:\/\/\S+)(?:\s+\[(\w+)\])?/);
    if (feedMatch) {
      feeds.push({
        url: feedMatch[1],
        category: currentCategory,
        priority: (feedMatch[2] || 'MEDIUM').toUpperCase(),
      });
    }
  }

  return feeds;
}

/**
 * Fetch a single feed. Returns normalized items or an error.
 */
async function fetchSingleFeed(feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const sourceName = feed.title || new URL(feedConfig.url).hostname;

    return {
      items: (feed.items || []).map(item => ({
        id: stableId(item.link, item.title),
        source: sourceName,
        sourceUrl: feedConfig.url,
        category: feedConfig.category,
        priority: feedConfig.priority,
        title: item.title || 'Untitled',
        summary: item.contentSnippet
          ? item.contentSnippet.slice(0, 300) + (item.contentSnippet.length > 300 ? '...' : '')
          : '',
        url: item.link || '',
        published: item.isoDate || item.pubDate || new Date().toISOString(),
        firstSeen: Date.now(),
      })),
      error: null,
    };
  } catch (err) {
    return { items: [], error: { url: feedConfig.url, message: err.message } };
  }
}

/**
 * Deduplicate items by ID. Keeps the first occurrence (highest priority wins
 * because feeds are fetched in priority order via sort before dedup).
 */
function deduplicateById(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Sort items: priority (HIGH first), then recency (newest first).
 */
function sortItems(items) {
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return items.sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
    if (pDiff !== 0) return pDiff;
    return new Date(b.published) - new Date(a.published);
  });
}

/**
 * Merge freshly fetched items with existing persisted items.
 * - New items overwrite old ones with the same ID (keeps metadata fresh).
 * - Old items not in the new fetch are kept if < ITEM_MAX_AGE_MS old,
 *   BUT only if their source feed is still in the active feed list.
 *   Items from removed feeds are dropped immediately on next refresh.
 * - Items older than ITEM_MAX_AGE_MS are dropped.
 */
function mergeWithPersisted(newItems, existingItems, activeFeedUrls) {
  const now = Date.now();
  const cutoff = now - ITEM_MAX_AGE_MS;

  // Build a map of new items by ID for fast lookup
  const newById = new Map(newItems.map(i => [i.id, i]));

  // Keep existing items that are still within TTL and weren't re-fetched,
  // and whose source feed is still configured.
  const retained = existingItems.filter(item => {
    if (newById.has(item.id)) return false;                          // covered by newItems
    if (activeFeedUrls && !activeFeedUrls.has(item.sourceUrl)) return false;  // feed removed
    const age = new Date(item.published).getTime();
    return age >= cutoff;                                            // drop if too old
  });

  return [...newItems, ...retained];
}

/**
 * Fetch all feeds, normalize, deduplicate, sort, merge with disk cache, persist.
 */
async function fetchAllFeeds(forceRefresh = false) {
  // Return in-memory cache if still fresh
  if (!forceRefresh && cache.fetchedAt > 0 && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { items: cache.items, errors: cache.errors, fetchedAt: cache.fetchedAt, fromCache: true };
  }

  const feedConfigs = parseRssConfig();
  if (feedConfigs.length === 0) {
    return { items: [], errors: [{ url: RSS_CONFIG_PATH, message: 'No feeds configured in rss.md' }], fetchedAt: Date.now(), fromCache: false };
  }

  // Fetch all feeds in parallel
  const results = await Promise.allSettled(feedConfigs.map(fc => fetchSingleFeed(fc)));

  let freshItems = [];
  const errors = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      freshItems.push(...result.value.items);
      if (result.value.error) errors.push(result.value.error);
    } else {
      errors.push({ url: 'unknown', message: result.reason?.message || 'Unknown error' });
    }
  }

  // Deduplicate fresh items, then merge with previously persisted items.
  // Pass the active feed URL set so items from removed feeds are dropped immediately.
  const activeFeedUrls = new Set(feedConfigs.map(fc => fc.url));
  freshItems = deduplicateById(freshItems);
  const merged = mergeWithPersisted(freshItems, cache.items, activeFeedUrls);
  const sorted = sortItems(merged);

  // Persist to disk so items survive server restarts
  saveDiskCache(sorted);

  // Update in-memory cache
  cache = { items: sorted, fetchedAt: Date.now(), errors };

  return { items: sorted, errors, fetchedAt: cache.fetchedAt, fromCache: false };
}

/**
 * Simple string hash for generating stable IDs.
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

module.exports = {
  fetchAllFeeds,
  parseRssConfig,
  fetchSingleFeed,
};
