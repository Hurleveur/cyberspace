# Changelog

All notable changes to the Cyberspace Intelligence System are documented here.

---

## [Post-2.0 patches] — 2026-03-14 to 2026-03-16

- Fixed `events.js` date parsing regression
- Added Vercel deployment config (`vercel.json`)
- Refined `.gitignore` and fixed announcement re-appearing on every run

---

## [2.0] — 2026-03-14 — Open Source Release

First public release. All changes in this version are preparation for open source.

### Repository
- Config files moved from repo root to `config/` subfolder
- Generic `.example.md` templates added for all config files — personal configs gitignored
- `reports/20*/` (personal daily reports) added to `.gitignore`
- `dashboard/certs/` added to `.gitignore` — SSL certificates were previously unexcluded
- Root-level personal config files (`events.md`, `news.md`, `previous-news.md`, `rss.md`) removed from tracking
- All personal location and operator-specific references scrubbed from committed files

### Intelligence System
- `CLAUDE.md` rewritten from scratch — security constraints merged from `docs/claude-cowork.md`, all paths updated to `config/`, tech stack search query (#5) now built dynamically rather than hardcoded
- `docs/claude-cowork.md` converted to a practical setup and operations guide (timing, token budget, task evaluation, troubleshooting)
- `docs/DASHBOARD-PLAN.md` example data de-personalised

### Documentation
- `readme.md` rewritten with full setup instructions, file structure, keyboard shortcuts, environment variables, service setup, deduplication explanation, privacy note, and report system documentation
- `ROADMAP.md` added — expected improvements across intelligence system, dashboard, and operations
- `CHANGELOG.md` added
- `CONTRIBUTING.md` added — includes AI-assisted PR requirements
- `.github/` issue templates (bug report, feature request) and PR template added with dashboard compatibility checklist

### Example Output
- `reports/example/` added — sanitised sample briefing, event radar, and markers demonstrating output format without personal data

---

## [1.5] — Late dashboard development

- Levelling system with XP and rank progression
- Notion integration added then removed in favour of Notion MCP
- Announcement system for first-run detection
- Import/export feature for data portability
- CryptPad integration for collaborative project tracking
- Autostart service configuration (`install-service.js`)
- Display state persisted across refreshes
- HTTPS redirect and self-signed cert setup (`setup-https.ps1`, port 4444)
- Nominatim client-side geocoding for unlocated map markers
- Phase 4 visual effects and glow animations completed

---

## [1.4] — Dashboard v1

Initial dashboard implementation across three development phases:

- **Phase 1** — Core map with WebSocket live updates, marker rendering, briefing panel, keyboard shortcuts
- **Phase 2** — News feed viewer, event radar panel, panel toggle shortcuts (F / B / Escape)
- **Phase 3** — Tasks panel (briefing actions, further reading, todos), RSS feed persistence and bookmarks, seen-events tab, inline RSS editor, feedback toast notifications, help overlay, radar favicon

---

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
