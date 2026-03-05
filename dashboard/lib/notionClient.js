/**
 * Notion API client wrapper.
 * Exports CRUD helpers used by the /api/notion/* routes in server.js.
 *
 * Database property names expected on the Notion database:
 *   Name          – title
 *   Type          – select  (task | link | further-reading)
 *   Done          – checkbox
 *   Assigned To   – multi_select
 *   Priority      – select  (High | Medium | Low)
 *   Due Date      – date
 *   Category      – multi_select (tags)
 *   Source Date   – date    (for briefing-sourced items)
 *   Dashboard ID  – rich_text (stable local ID for reconciliation)
 */

const { Client } = require('@notionhq/client');

let _client = null;

function getClient() {
  if (!process.env.NOTION_TOKEN) return null;
  if (!_client) {
    _client = new Client({
      auth: process.env.NOTION_TOKEN,
      timeoutMs: 10000, // fail fast — default is 60s which blocks the server
    });
  }
  return _client;
}

/** Call after updating NOTION_TOKEN via /api/settings so the client re-initialises. */
function resetClient() {
  _client = null;
}

function dbId() {
  return process.env.NOTION_DATABASE_ID || null;
}

function isConfigured() {
  return !!(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
}

// ─── Normalise Notion page → internal task object ─────────────────────────────

function getTitle(prop)       { return prop?.title?.[0]?.plain_text ?? ''; }
function getSelect(prop)      { return prop?.select?.name ?? null; }
function getMultiSelect(prop) { return (prop?.multi_select ?? []).map(x => x.name); }
function getCheckbox(prop)    { return prop?.checkbox ?? false; }
function getDate(prop)        { return prop?.date?.start ?? null; }
function getRichText(prop)    { return prop?.rich_text?.[0]?.plain_text ?? ''; }

function normalizePage(page) {
  const p = page.properties;
  return {
    notionId:       page.id,
    text:           getTitle(p['Name']),
    type:           getSelect(p['Type']) ?? 'task',
    done:           getCheckbox(p['Done']),
    assignedTo:     getMultiSelect(p['Assigned To']),
    priority:       getSelect(p['Priority']),
    dueDate:        getDate(p['Due Date']),
    tags:           getMultiSelect(p['Category']),
    sourceDate:     getDate(p['Source Date']),
    dashboardId:    getRichText(p['Dashboard ID']),
    lastEditedTime: page.last_edited_time,
    archived:       page.archived,
  };
}

// ─── Build Notion properties from a task object ───────────────────────────────

function buildProperties(task) {
  const props = {
    'Name': { title: [{ text: { content: (task.text || '').slice(0, 2000) } }] },
    'Done': { checkbox: !!task.done },
  };

  if (task.type != null)
    props['Type'] = { select: { name: task.type } };
  if (Array.isArray(task.assignedTo) && task.assignedTo.length)
    props['Assigned To'] = { multi_select: task.assignedTo.map(n => ({ name: n })) };
  if (task.priority)
    props['Priority'] = { select: { name: task.priority } };
  if (task.dueDate)
    props['Due Date'] = { date: { start: task.dueDate } };
  if (Array.isArray(task.tags) && task.tags.length)
    props['Category'] = { multi_select: task.tags.map(t => ({ name: t })) };
  if (task.sourceDate)
    props['Source Date'] = { date: { start: task.sourceDate } };
  if (task.dashboardId != null)
    props['Dashboard ID'] = { rich_text: [{ text: { content: String(task.dashboardId) } }] };

  return props;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/** Fetch all non-archived tasks from the database. */
async function fetchTasks() {
  const client = getClient();
  const id = dbId();
  if (!client || !id) return { error: 'Notion not configured' };

  try {
    const pages = [];
    let cursor;
    do {
      const resp = await client.databases.query({
        database_id: id,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      pages.push(...resp.results);
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    return { tasks: pages.filter(p => !p.archived).map(normalizePage) };
  } catch (err) {
    return { error: err.message };
  }
}

/** Create a new task page in the database. Returns the normalised page. */
async function createTask(data) {
  const client = getClient();
  const id = dbId();
  if (!client || !id) return { error: 'Notion not configured' };

  try {
    const page = await client.pages.create({
      parent: { database_id: id },
      properties: buildProperties(data),
    });
    return normalizePage(page);
  } catch (err) {
    return { error: err.message };
  }
}

/** Update properties on an existing task page. Returns the normalised page. */
async function updateTask(pageId, patch) {
  const client = getClient();
  if (!client) return { error: 'Notion not configured' };

  try {
    const page = await client.pages.update({
      page_id: pageId,
      properties: buildProperties(patch),
    });
    return normalizePage(page);
  } catch (err) {
    return { error: err.message };
  }
}

/** Soft-delete (archive) a task page. */
async function archiveTask(pageId) {
  const client = getClient();
  if (!client) return { error: 'Notion not configured' };

  try {
    await client.pages.update({ page_id: pageId, archived: true });
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { isConfigured, resetClient, fetchTasks, createTask, updateTask, archiveTask };
