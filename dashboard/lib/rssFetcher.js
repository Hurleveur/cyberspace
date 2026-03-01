const fs = require('fs');
const path = require('path');
const RssParser = require('rss-parser');

const { PROJECT_ROOT } = require('./fileManager');

const RSS_CONFIG_PATH = path.join(PROJECT_ROOT, 'rss.md');
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const parser = new RssParser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  timeout: 10000, // 10 second timeout per feed
});

// In-memory cache
let cache = {
  items: [],
  fetchedAt: 0,
  errors: [],
};

/**
 * Parse rss.md to extract feed URLs with their category and priority.
 * Returns [{ url, category, priority }]
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

    // Section headings
    const headingMatch = trimmed.match(/^##\s+(.+)/);
    if (headingMatch) {
      currentCategory = headingMatch[1].trim();
      continue;
    }

    // Feed URLs: lines starting with - containing an http URL
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
      items: (feed.items || []).map((item, i) => ({
        id: `rss-${Buffer.from(feedConfig.url).toString('base64').slice(0, 12)}-${i}-${Date.now()}`,
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
      })),
      error: null,
    };
  } catch (err) {
    return {
      items: [],
      error: { url: feedConfig.url, message: err.message },
    };
  }
}

/**
 * Deduplicate items by title similarity (exact lowercase match).
 * Keeps the item with higher priority.
 */
function deduplicateItems(items) {
  const seen = new Map();
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  for (const item of items) {
    const key = item.title.toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing || priorityOrder[item.priority] < priorityOrder[existing.priority]) {
      seen.set(key, item);
    }
  }

  return Array.from(seen.values());
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
 * Fetch all feeds, normalize, deduplicate, sort, and cache.
 * Returns { items, errors, fetchedAt, fromCache }.
 */
async function fetchAllFeeds(forceRefresh = false) {
  // Return cache if still fresh
  if (!forceRefresh && cache.fetchedAt > 0 && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      items: cache.items,
      errors: cache.errors,
      fetchedAt: cache.fetchedAt,
      fromCache: true,
    };
  }

  const feedConfigs = parseRssConfig();
  if (feedConfigs.length === 0) {
    return { items: [], errors: [{ url: RSS_CONFIG_PATH, message: 'No feeds configured in rss.md' }], fetchedAt: Date.now(), fromCache: false };
  }

  // Fetch all feeds in parallel
  const results = await Promise.allSettled(
    feedConfigs.map(fc => fetchSingleFeed(fc))
  );

  let allItems = [];
  const errors = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value.items);
      if (result.value.error) errors.push(result.value.error);
    } else {
      errors.push({ url: 'unknown', message: result.reason?.message || 'Unknown error' });
    }
  }

  // Deduplicate and sort
  allItems = deduplicateItems(allItems);
  allItems = sortItems(allItems);

  // Assign stable IDs based on URL hash
  allItems = allItems.map((item, i) => ({
    ...item,
    id: `rss-${hashString(item.url || item.title)}-${i}`,
  }));

  // Update cache
  cache = {
    items: allItems,
    fetchedAt: Date.now(),
    errors,
  };

  return {
    items: allItems,
    errors,
    fetchedAt: cache.fetchedAt,
    fromCache: false,
  };
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
};
