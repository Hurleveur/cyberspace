// Run: node --test (from dashboard/)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Simulate Vercel with an empty database, so reads fall through to the deployed files
process.env.VERCEL = '1';
const dbPath = require.resolve('../lib/dbStorage');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { readFile: async () => ({ error: 'File not found', status: 404 }), invalidateCache() {} },
};
const fm = require('../lib/fileManager');
const storage = require('../lib/storage');

test('anonymous config read falls back to the example file when the real one is not deployed', async (t) => {
  const realRead = fm.readFile;
  t.after(() => { fm.readFile = realRead; });
  fm.readFile = async (p) => (p === 'config/rss.md' ? { error: 'File not found', status: 404 } : realRead(p));

  const result = await storage.readFile('config/rss.md');
  assert.ifError(result.error);
  assert.match(result.content, /^# RSS Feed Sources/);
  assert.match(result.content, /- https:\/\/krebsonsecurity\.com\/feed\/ \[HIGH\]/);
});
