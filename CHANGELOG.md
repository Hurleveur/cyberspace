# Changelog

All notable changes to the Cyberspace Intelligence System are documented here.

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

## [1.0–1.6] — Early development

Initial development history is not included in the public repository.

---

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
