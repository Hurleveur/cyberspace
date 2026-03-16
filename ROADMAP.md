# Roadmap — Cyberspace Intelligence System

Expected improvements and open contribution areas. This document is intentionally
high-level — implementation details are left to contributors.
Currently the dashboard only works locally and gives a preview online.

If you're willing to work on this project I'm more than willing to talk about it and direct you in issues, a call or IRL.

---

## Vercel / Cloud Deployment

The current Vercel setup is a minimal shim: auth-gated writes, serverless export,
and a `vercel.json`. The following items are needed for a fully production-grade
cloud deployment.

### Persistent Storage Backend
The dashboard reads and writes local files (`config/`, `reports/`, `dashboard/data/`).
On Vercel, the file system is read-only and ephemeral — writes don't survive between
function invocations. A persistent backend is required for any write operation to
work in production. Recommended approach: use the local agent to push reports to a
private GitHub repository, and have the dashboard read from the GitHub Contents API.
For projects/feed cache: Vercel KV (Redis) or a small Postgres (Neon/Supabase).

### Replace WebSockets with Polling
The live-update mechanism uses `ws` + `chokidar` — both require a persistent
long-lived server process that doesn't exist in serverless. Replace with a simple
client-side polling loop (`setInterval` calling `/api/reports/latest` every 30s)
and remove the WebSocket and file-watcher code from the server.

### Vercel Cron for Feed Refresh
The 15-minute RSS refresh `setInterval` dies with each serverless function invocation.
Replace with a Vercel Cron Job (`"crons"` in `vercel.json`) hitting
`POST /api/feeds/refresh` on a schedule. Requires the feed cache to be stored in
persistent storage (see above).

### Self-Host Fonts and Client Dependencies
`index.html` loads JetBrains Mono from Google Fonts (privacy leak — every visit
pings Google with the visitor's IP) and loads Leaflet/marked.js from public CDNs
(supply-chain risk). Move all three into `dashboard/public/vendor/` and update
the `<script>`/`<link>` tags. Font files: download WOFF2, add `@font-face` in CSS.

### Security Headers
Add a `"headers"` block to `vercel.json` with `Content-Security-Policy`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
no-referrer`, and `Permissions-Policy`. The CSP should lock down `script-src` to
`'self'` plus any self-hosted vendor paths (removes CDN entries once fonts/libs
are self-hosted).

### Dashboard Auth UI
Currently auth requires manually passing `Authorization: Bearer <token>` in every
API call. The settings panel and terminal feedback command will silently fail for
unauthenticated sessions. Add a simple login overlay (token entry form, stored in
`sessionStorage`) so the dashboard is usable without manual header injection.

---

## Intelligence System

### Report Feed / RSS Subscription
Allow the briefing to be consumed as a feed. Users could subscribe to their own
Cyberspace instance and receive reports in any RSS reader, push notification client,
or email inbox — without opening the dashboard. A natural companion to the existing
live RSS feed panel.

### Multi-Operator Support
Currently the system is tuned to a single operator profile. Supporting multiple
profiles (e.g. for a team) would let each member receive a briefing weighted to
their own interests and tech stack, generated from a single shared instance.

### Email Delivery
Optional daily email containing the briefing, with a plain-text fallback. Could
be delivered via a self-hosted SMTP relay or a pluggable provider. Useful for
people who prefer not to check a local dashboard.

### Configurable AI Platform
Currently requires Claude via Cowork. Adding support for the Anthropic API directly
(or other providers) would let the system run headless in any environment without
needing the Cowork desktop app.

---

## Dashboard

### Google Calendar Integration
Full OAuth-based Google Calendar write support. Currently the Events panel supports
ICS export (download and import). A direct GCal integration would allow
click-to-add-to-calendar from the Events panel.

### Notification Integrations
Push high-priority (🔴 CRITICAL) stories to external channels: Slack, Discord,
Telegram, or any webhook. Configurable per priority level.

### Full-Text Cross-Report Search
Indexed search across all past briefings — not just headings, but the full body
of every report. Useful for looking up when a CVE was first mentioned, or tracking
how a threat actor has evolved across reports.

---

## Setup & Operations

### Docker / Container Support
A `docker-compose.yml` that runs the dashboard and wraps the scheduling layer,
making Cyberspace deployable on any Linux server without Windows or Cowork.

### CLI Setup Tool
A guided command-line setup that walks a new user through filling in their
`config/*.md` files interactively, rather than editing them manually.
Could also handle first-run validation (does the dashboard start correctly?
are config files present?).

### Automated Config Validation
On startup, check that all required config files exist and contain expected
sections. Surface clear errors if a file is missing or misconfigured, rather
than failing silently on the first scheduled run.

---

## Contributing

Pull requests are welcome. If you build any of the above, open a PR with a brief
description of your approach and a note on any config changes required.

For bugs or feature ideas not listed here, open an issue.
