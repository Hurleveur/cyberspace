#!/usr/bin/env node
/**
 * Push all local briefing reports to the Turso (libSQL) database.
 *
 * Reads every YYYY-MM-DD folder under reports/, reads each file inside,
 * and upserts into the `reports` table (INSERT OR REPLACE).
 *
 * Usage:
 *   node scripts/push-reports.js            # push all reports
 *   node scripts/push-reports.js 2026-03-07 # push a specific date
 */

const fs = require('fs');
const path = require('path');

// Load env vars from dashboard/.env
const envPath = path.resolve(__dirname, '..', 'dashboard', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const { createClient } = require(path.resolve(__dirname, '..', 'dashboard', 'node_modules', '@libsql', 'client'));

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || '',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
});

const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function ensureTable() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS reports (
      report_date TEXT NOT NULL,
      filename    TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      PRIMARY KEY (report_date, filename)
    )
  `);
}

async function pushDate(dateStr) {
  const dir = path.join(REPORTS_DIR, dateStr);
  if (!fs.existsSync(dir)) {
    console.error(`  No report directory for ${dateStr}`);
    return 0;
  }

  const files = fs.readdirSync(dir).filter(f => {
    const full = path.join(dir, f);
    return fs.statSync(full).isFile();
  });

  if (files.length === 0) {
    console.log(`  ${dateStr}: no files, skipping`);
    return 0;
  }

  const now = new Date().toISOString();
  let count = 0;

  for (const filename of files) {
    const filePath = path.join(dir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');

    await client.execute({
      sql: `INSERT OR REPLACE INTO reports (report_date, filename, content, created_at)
            VALUES (?, ?, ?, ?)`,
      args: [dateStr, filename, content, now],
    });

    count++;
    console.log(`  ${dateStr}/${filename} (${content.length} bytes)`);
  }

  return count;
}

async function main() {
  const specificDate = process.argv[2];

  console.log('Connecting to Turso...');
  console.log(`  URL: ${process.env.TURSO_DATABASE_URL}`);

  await ensureTable();
  console.log('Table "reports" ready.\n');

  let dates;
  if (specificDate) {
    if (!DATE_RE.test(specificDate)) {
      console.error(`Invalid date format: ${specificDate} (expected YYYY-MM-DD)`);
      process.exit(1);
    }
    dates = [specificDate];
  } else {
    dates = fs.readdirSync(REPORTS_DIR)
      .filter(name => DATE_RE.test(name))
      .sort();
  }

  console.log(`Found ${dates.length} report date(s) to push.\n`);

  let totalFiles = 0;
  for (const d of dates) {
    console.log(`Pushing ${d}...`);
    const count = await pushDate(d);
    totalFiles += count;
  }

  console.log(`\nDone. Pushed ${totalFiles} file(s) across ${dates.length} date(s).`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
