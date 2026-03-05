# Notion Integration Setup Guide

This guide walks through connecting the Cyberspace Dashboard to a Notion workspace so that tasks, links, and further reading items sync bi-directionally between the dashboard and a dedicated Notion database.

---

## Prerequisites

- A Notion account
- The dashboard server running (`npm start` inside `dashboard/`)
- Node.js 18+

---

## Step 1 — Create a Notion Integration

1. Go to **https://www.notion.so/my-integrations**
2. Click **+ New integration**
3. Give it a name, e.g. `Cyberspace Dashboard`
4. Set the associated workspace to the one you want to use
5. Under **Capabilities**, enable:
   - ✅ Read content
   - ✅ Update content
   - ✅ Insert content
6. Click **Save**
7. Copy the **Internal Integration Token** — it starts with `secret_`

---

## Step 2 — Create the Tasks Database in Notion

1. Open Notion and navigate to the page where you want to create the database
2. Type `/database` and choose **Database — Full page** (or inline is fine too)
3. Name it **Cyberspace Tasks**
4. Add the following properties (exact names matter):

| Property Name | Type        | Notes                                      |
|---------------|-------------|--------------------------------------------|
| Name          | Title       | Already exists by default                 |
| Type          | Select      | Options: `task`, `link`, `further-reading` |
| Done          | Checkbox    |                                            |
| Assigned To   | Multi-select | Add team member names as options           |
| Priority      | Select      | Options: `High`, `Medium`, `Low`           |
| Due Date      | Date        |                                            |
| Category      | Multi-select | Free tags for categorising tasks           |
| Source Date   | Date        | Auto-filled for briefing-sourced items     |
| Dashboard ID  | Text        | Used internally for sync reconciliation    |

> **Tip:** The order of columns doesn't matter, only the names.

---

## Step 3 — Share the Database with Your Integration

1. Open the **Cyberspace Tasks** database in Notion
2. Click **Share** (top right)
3. In the search box, type the name of your integration (`Cyberspace Dashboard`)
4. Select it and click **Invite**

---

## Step 4 — Get the Database ID

1. Open the database in Notion as a **full page** (click ↗ to open)
2. Look at the URL — it will look like:
   ```
   https://www.notion.so/yourworkspace/abc123def456...?v=...
   ```
3. The Database ID is the 32-character hex string before the `?v=` parameter.
   It may appear with or without dashes, e.g.:
   ```
   abc123de-f456-7890-abcd-ef1234567890
   ```

---

## Step 5 — Configure the Dashboard

### Option A — Via the Dashboard UI (recommended)

1. Start the dashboard: `cd dashboard && npm start`
2. Open **http://localhost:3000**
3. Click the **Tasks** button (or press `T`) to open the right panel
4. Click the ⚙ gear icon in the **Notion** status bar at the top of the panel
5. Enter your **Integration Token** and **Database ID**
6. Click **Save**

The dashboard will immediately attempt to connect and sync.

### Option B — Via the .env file

1. Open (or create) `dashboard/.env`
2. Add your credentials:
   ```env
   NOTION_TOKEN=secret_your_token_here
   NOTION_DATABASE_ID=your-database-uuid-here
   ```
3. Restart the dashboard server

---

## Step 6 — Invite a Collaborator

1. Open your Notion workspace
2. Click **Settings & members** → **Members**
3. Invite your collaborator by email
4. Share the **Cyberspace Tasks** database with them (same as Step 3)
5. They open the dashboard on their machine, configure the same `NOTION_TOKEN` and `NOTION_DATABASE_ID`

Both of you will now see each other's tasks within ~30 seconds (the poll interval).

---

## How Sync Works

| Action | Behaviour |
|--------|-----------|
| Create task in dashboard | Pushed to Notion within ~2 s |
| Create task in Notion | Appears in dashboard within 30 s |
| Toggle done in either place | Syncs to the other within 30 s |
| Delete task in dashboard | Archived (hidden) in Notion |
| Archive task in Notion | Removed from dashboard on next poll |
| Further Reading (hidden via ×) | Marked as Done in Notion |
| Briefing Actions | **Not synced** — localStorage only |

### Sync Scope

| Section | Synced to Notion |
|---------|-----------------|
| Briefing Actions | ✗ Local only |
| Further Reading | ✓ |
| My Tasks | ✓ (with metadata) |
| My Links | ✓ |

### Supported Task Fields

When creating tasks in the dashboard, click **⊕** next to the task input to expand the metadata form:

- **Assignee** — who is responsible
- **Priority** — High / Medium / Low (shown as coloured badges)
- **Due Date** — shown with colour coding (red = overdue, orange = due soon)
- **Tags** — comma-separated free-text tags

All fields sync with Notion automatically.

---

## Troubleshooting

**"Sync error" shows in the status bar**
- Check that the token hasn't expired or been revoked
- Verify the database is shared with the integration (Step 3)
- Check the terminal running the server for detailed error messages

**Tasks created in Notion don't appear**
- Make sure the database has all required properties (Step 2)
- Property names are case-sensitive — check exact spelling
- Verify the Database ID is correct (no extra characters)

**Token format error when saving**
- Integration tokens always start with `secret_` — make sure you copied the full token

**Dashboard works but Notion isn't set up yet**
- The dashboard falls back gracefully to localStorage-only mode
- All existing tasks are preserved and will be pushed to Notion once configured

---

## Security Notes

- The `NOTION_TOKEN` is stored in `dashboard/.env` which is never served to the browser
- All Notion API calls go through the local server (`/api/notion/*`)  — the token is never exposed client-side
- `dashboard/.env` is git-ignored by default — do not commit it
- The `/api/settings` endpoint validates token and database ID format before writing

---

*Cyberspace Intelligence System — Notion Integration v1.0*
