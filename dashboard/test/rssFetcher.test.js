// Run: node --test (from dashboard/). Hits the network.
const test = require('node:test');
const assert = require('node:assert');
const { fetchSingleFeed } = require('../lib/rssFetcher');

test('a feed that 403s the browser UA is retried with the reader UA', async () => {
  const r = await fetchSingleFeed({ url: 'https://www.bleepingcomputer.com/feed/', category: 'Test', priority: 'HIGH' });
  assert.strictEqual(r.error, null);
  assert.ok(r.items.length > 0);
});
