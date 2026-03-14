# Roadmap — Cyberspace Intelligence System

Expected improvements and open contribution areas. This document is intentionally
high-level — implementation details are left to contributors.

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
