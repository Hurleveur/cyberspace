# Cyberspace Intelligence System

A self-configuring personal intelligence agent that wakes up every morning, searches the
web for cybersecurity and AI news, and delivers a curated daily briefing and weekly event
radar — rendered on a local hacker-aesthetic dashboard.

Built on [Claude Cowork](https://claude.ai/download) (Anthropic) and a lightweight
Node.js server. Configured entirely through plain markdown files.

![Threat level: HIGH](https://img.shields.io/badge/threat%20level-HIGH-orange)
![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)

---

## What it does

Every morning at a scheduled time, the system:

1. Reads your profile (`config/interests.md`) and configuration files
2. Applies any feedback you've written since the last run
3. Runs 5 targeted web searches across cybersecurity and AI categories
4. Filters and scores every story against your interests, tech stack, and geographic focus
5. Writes a **Daily Briefing** (`reports/YYYY-MM-DD/briefing.md`) with threat analysis, action items, and categorised stories
6. On Mondays: runs a full **Event Radar** and writes `reports/YYYY-MM-DD/events.md`
7. Saves `markers.json` for the dashboard map

The dashboard auto-updates when a new report lands. See `reports/example/` for sample output.

---

## How it works

Cyberspace has two independent components that work together:

```
┌─────────────────────────────────┐      ┌──────────────────────────────────┐
│        Claude Cowork            │      │       Node.js Dashboard          │
│  (scheduled AI agent)           │      │  (local web app)                 │
│                                 │      │                                  │
│  Reads your config/             │ ───► │  Reads reports/YYYY-MM-DD/       │
│  Searches the web               │      │  Renders briefing + map          │
│  Writes reports/YYYY-MM-DD/     │      │  Shows RSS feeds + events        │
└─────────────────────────────────┘      └──────────────────────────────────┘
```

**The agent** — runs inside [Claude Cowork](https://claude.ai/download) as a scheduled
task. It reads your profile and config files, runs targeted web searches, and writes a
daily briefing to `reports/`. It runs once a day — it does not need to stay running.

**The dashboard** — a local Node.js server at `http://localhost:3000`. It watches the
`reports/` folder and auto-refreshes when a new briefing lands. This is what you look at
each morning.

**The config files** — plain markdown files in `config/`. They tell the agent who you are,
what to prioritise, which sources to trust, and which events are relevant. You never need
to touch `CLAUDE.md` or any code to tune the system — editing the markdown is enough.

**The feedback loop** — write anything in `config/feedback.md` between runs. On the next
run the agent reads your notes, updates the right config files, clears the file, and
confirms what changed in the briefing. Plain language, no syntax.

---

## Requirements

- **Claude Cowork** (Anthropic desktop app) — the agent runs as a scheduled task
- **Node.js 18+** — for the dashboard
- **Google Calendar** (optional) — for event conflict detection on Monday runs

---

## Setup

> **New here?** Here's the full picture before you dive in:
> 1. Install Claude Cowork and Node.js (if you haven't already)
> 2. Copy the example config files and fill in `config/interests.md` — this is the only file that's truly personal
> 3. Start the dashboard (`npm start` inside `dashboard/`)
> 4. Create a scheduled task in Claude Cowork pointing at this folder
> 5. Trigger the first run manually and open the dashboard
>
> The detailed steps are below. The whole process takes about 15 minutes.
> For the Cowork task setup in depth, see **[docs/claude-cowork.md](docs/claude-cowork.md)**.

### 1. Clone the repository

```bash
git clone https://github.com/your-username/cyberspace.git
cd cyberspace
```

### 2. Create your configuration files

Copy each example and fill it in:

```bash
cp config/interests.example.md    config/interests.md
cp config/news.example.md         config/news.md
cp config/events.example.md       config/events.md
cp config/feedback.example.md     config/feedback.md
cp config/seen-events.example.md  config/seen-events.md
cp config/previous-news.example.md config/previous-news.md
cp config/rss.example.md          config/rss.md
```

**Start with `config/interests.md`** — it is the most important file. It defines who you
are, what you care about, your technology stack, and your event preferences. The agent
reads it on every run to decide what to include and what to skip.

A good first move: open Claude Cowork, point it at this project, and ask it to interview
you to fill in `config/interests.md`. It will ask questions and write the file for you.

### 3. Set up the dashboard

```bash
cd dashboard
npm install
cp .env.example .env
# Edit .env if you want to change ports or map center
npm start
```

The dashboard will be available at `http://localhost:3000`.

**Map center:** Set `MAP_CENTER=lat,lng` in `dashboard/.env` to center the map on your
city (e.g. `MAP_CENTER=48.8566,2.3522` for Paris, or `MAP_CENTER=51.5074,-0.1278` for London).

**Optional — HTTPS** (required for CryptPad integration): Run `setup-https.ps1` once as
administrator (Windows) to generate a self-signed certificate. On Linux, provide your own
certs in `dashboard/certs/cert.pem` and `dashboard/certs/key.pem`. When certs are present,
the server starts on `:4444` (HTTPS) and `:3000` redirects to it.

Full instructions: **[docs/https-setup.md](docs/https-setup.md)**

### 4. Configure the Claude Cowork scheduled task

Open Claude Cowork, select this folder as your workspace, and create a new scheduled task
with the following prompt:

```
You are the Cyberspace Intelligence System. Your workspace is this cyberspace/ folder.

Read CLAUDE.md — it contains your complete operational instructions, security constraints,
output formats, and file path specifications. Follow it exactly.

Config files are in the config/ subfolder.
Reports are written to reports/YYYY-MM-DD/ (create today's folder).
```

Set the schedule to run daily at your preferred time (e.g. 08:00 or 10:00 local time).

> **Note:** `CLAUDE.md` contains the agent's operational instructions — it is read by the
> Claude Cowork scheduled task, not by Claude.ai chat or the Claude Code CLI.

**Optional Cowork integration:** Google Calendar — for event conflict detection on Monday runs

### 5. First run

Trigger the scheduled task manually from Cowork. On first run, the system will:
- Detect that `reports/` is empty and display the system initialization banner
- Write `reports/YYYY-MM-DD/briefing.md` and `announcement.md`
- Produce a Monday event radar if today is Monday

Open `http://localhost:3000` and you'll see your first briefing.

---

## Configuration

**Your profile** (`config/interests.md`) controls everything: what news gets flagged
CRITICAL, what events are included, and how stories are scored. Start here.

**Instruction file** (`CLAUDE.md`) — the operational playbook the agent follows.
Edit this to change behaviour at the highest level: search budget, output format,
phase logic. Most users won't need to touch it.

**News rules** (`config/news.md`) — source tiers, categories, priority levels.

**Event rules** (`config/events.md`) — discovery sources, scoring criteria, geographic focus.

**RSS feeds** (`config/rss.md`) — sources for the dashboard's live Feeds panel.

### Tuning via feedback

The easiest way to change anything is to write in `config/feedback.md`:

```
I don't care about [topic], remove it.
More coverage of [topic].
Add [source] as a news source.
Only show high-priority items.
I went to [event] last week — always include those.
```

On the next run, the agent reads your notes, determines which config files to update,
edits them, clears `feedback.md`, and prepends a `## 📝 Feedback Applied` section to that
day's briefing. No syntax required — plain language works.

---

## Dashboard

The dashboard renders reports at `http://localhost:3000`.

### Panels

**Left panel** — Feeds tab and Briefing tab (toggle with `F` / `B`):
- **Feeds** — Live RSS items from `config/rss.md`, with filters, unread tracking, and bookmarks.
- **Briefing** — Rendered daily report with day navigator and cross-report search.

**Map (center)** — Leaflet world map with geocoded markers from `markers.json`.
Colour-coded by priority (🔴 critical → 🟢 low). Click a marker to highlight the story in the Briefing panel.

**Right panel** — Events tab and Tasks tab (toggle with `E` / `T`):
- **Events** — Weekly event radar with accept/skip state and ICS export.
- **Tasks** — Action items and further reading from the briefing, plus user tasks.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `F` | Toggle Feeds panel |
| `B` | Toggle Briefing panel |
| `E` | Toggle Events panel |
| `T` | Toggle Tasks panel |
| `/` | Open terminal / command palette |
| `Ctrl+K` | Open search palette |
| `Ctrl+F` | Search within current briefing |
| `◄` / `►` | Navigate between report days |

### Terminal commands

Open the terminal with `/`. Use `>` prefix for commands:
- `> theme green|amber|cyan` — switch accent colour
- `> status` — system status (streak, last run, unread count)
- `> threat` — current threat level summary
- `> feedback <text>` — quick-append to `config/feedback.md`
- `> refresh feeds` — force-refresh RSS feeds

### Environment variables (`dashboard/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | `3000` | HTTP port (redirects to HTTPS if certs are present) |
| `HTTPS_PORT` | `4444` | HTTPS port (active only when certs are present) |
| `MAP_CENTER` | `20,0` | Initial map centre as `lat,lng` |

### Running as a background service

**Windows** — Run `node install-service.js` inside `dashboard/` (as Administrator) to
register as a Windows Service, or use the WinSW wrapper in `dashboard/daemon/`.

**Linux / macOS** — Use PM2:
```bash
npm install -g pm2
cd dashboard
pm2 start server.js --name cyberspace-dashboard
pm2 save && pm2 startup
```

Full instructions for both platforms: **[docs/autostart.md](docs/autostart.md)**

---

## How reports work

Each run produces a folder at `reports/YYYY-MM-DD/` containing up to four files:

**`briefing.md`** — the daily intelligence report. Contains the threat landscape summary, categorised stories with source citations and priority levels, action items, and further reading links. The Briefing panel renders this directly.

**`events.md`** — the weekly event radar. Written on Monday runs only; persists in the dashboard across the whole week until the next Monday scan overwrites it. The Events panel parses this file with a strict field-name regex — field names like `**When:**`, `**Where:**`, `**Relevance:**`, and `**Why this matters:**` must be exact. See `CLAUDE.md` → Dashboard Compatibility for the full rules.

**`markers.json`** — geocoded map markers for every story and event in that day's briefing. The map plots pins coloured by priority (red → critical, orange → high, yellow → medium, green → low). Clicking a marker highlights the corresponding story in the Briefing panel.

**`announcement.md`** — written once on the first ever run, and optionally again after major version changes. Contains a short system message rendered by the announcement widget. On first run, the briefing also gets the full ASCII initialisation banner prepended.

### The streak

The briefing footer shows `Briefing #N` where N is the count of date subfolders in `reports/`. Increments automatically — no manual counter.

### Friday week in review

On Friday runs, the system appends a **Week in Review** section comparing threat levels and recurring themes across the week — useful for spotting escalating campaigns that only become visible over several days.

### Deduplication

**`config/previous-news.md`** — one-line entry per story, pruned to 21 days. Stories already covered are skipped unless there is genuinely new development: updated scope, confirmed attribution, new impact, or follow-up action required.

**`config/seen-events.md`** — events surfaced in the radar are suppressed in future runs. Re-included only if a deadline is within 48h, or an explicit trigger is set. Don't edit manually unless you want to force a reappearance.

---

## File structure

```
cyberspace/
│
├── CLAUDE.md              ← Agent instructions — read first on every run
├── ROADMAP.md             ← Expected improvements and open contribution areas
├── CONTRIBUTING.md        ← How to contribute: setup, conventions, PR rules
├── readme.md              ← This file
│
├── config/
│   ├── interests.md           ← Your profile (gitignored — personal)
│   ├── news.md                ← News sources, categories, priority rules (gitignored)
│   ├── events.md              ← Event discovery rules and scoring matrix (gitignored)
│   ├── feedback.md            ← Write notes here; applied on next run (gitignored)
│   ├── seen-events.md         ← Auto-maintained event deduplication log (gitignored)
│   ├── previous-news.md       ← Auto-maintained news deduplication log (gitignored)
│   ├── rss.md                 ← RSS feed sources for the dashboard (gitignored)
│   │
│   ├── interests.example.md   ← Template — copy to interests.md and fill in
│   ├── news.example.md        ← Template — copy to news.md and fill in
│   ├── events.example.md      ← Template — copy to events.md and fill in
│   ├── feedback.example.md    ← Template — copy to feedback.md
│   ├── seen-events.example.md ← Template — copy to seen-events.md (start empty)
│   ├── previous-news.example.md ← Template — copy to previous-news.md (start empty)
│   └── rss.example.md         ← Template — copy to rss.md and fill in
│
├── reports/
│   ├── example/               ← Sample output — see what reports look like
│   │   ├── briefing.md
│   │   ├── events.md
│   │   └── markers.json
│   └── YYYY-MM-DD/            ← Your daily reports (gitignored)
│       ├── briefing.md
│       ├── events.md          ← Monday runs only
│       ├── markers.json
│       └── announcement.md    ← First run or major version changes only
│
├── docs/
│   ├── DASHBOARD-PLAN.md      ← Technical architecture of the dashboard
│   ├── claude-cowork.md       ← How to set up and run the scheduled task in Claude Cowork
│   ├── cryptpad-projects.md   ← CryptPad Kanban integration guide
│   ├── https-setup.md         ← How to enable HTTPS with a trusted self-signed cert
│   └── autostart.md           ← How to run the dashboard as a Windows service or Linux PM2 process
│
└── dashboard/                 ← Local Node.js dashboard
    ├── server.js
    ├── .env.example
    ├── package.json
    ├── public/                ← Frontend (HTML/CSS/JS + Leaflet map)
    └── lib/                   ← Server utilities (file manager, RSS fetcher)
```

---

## Privacy

All personal configuration files (`config/*.md`, excluding `.example.md` templates) are
gitignored and never committed to the repository. The system never transmits your profile
data externally — interests and preferences are used locally to filter and score results.
The only external communication is generic web searches.

See `CLAUDE.md` → Security Constraints for the full enforcement rules.

---

## Contributing

Contributions are welcome. Before opening a PR, read **[CONTRIBUTING.md](CONTRIBUTING.md)**
for setup instructions, coding conventions, privacy requirements, and the PR rules
(including the AI prompt disclosure policy).

For planned work and open contribution areas, see **[ROADMAP.md](ROADMAP.md)**.

When filing issues or PRs on GitHub, the default templates will guide you:
- **Bug report** — reproducing steps, environment, relevant output
- **Feature request** — problem statement, proposed solution, roadmap cross-check
- **Pull request** — change type, testing notes, dashboard compatibility checklist

---

## License

Apache License 2.0 — see `LICENSE` and `NOTICE`.
