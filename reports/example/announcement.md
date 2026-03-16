---
title: "System Online — Cyberspace Intelligence v1.0"
type: system
date: 2026-02-28
---

```
██████╗██╗   ██╗██████╗ ███████╗██████╗ ███████╗██████╗  █████╗  ██████╗███████╗
██╔════╝╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝██╔════╝
██║      ╚████╔╝ ██████╔╝█████╗  ██████╔╝███████╗██████╔╝███████║██║     █████╗
██║       ╚██╔╝  ██╔══██╗██╔══╝  ██╔══██╗╚════██║██╔═══╝ ██╔══██║██║     ██╔══╝
╚██████╗   ██║   ██████╔╝███████╗██║  ██║███████║██║     ██║  ██║╚██████╗███████╗
 ╚═════╝   ╚═╝   ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝ ╚═════╝╚══════╝
```

---

**SYSTEM ONLINE // NODE INITIALISED // INTELLIGENCE FEED ACTIVE**

---

You're looking at **Cyberspace** — a personal threat intelligence terminal.

Here is the concept:
Every morning at 10:00 (or one morning out of two because it's a lot of briefing!), my node wakes up, ghosts through the open web, and drops a briefing for you you just have to fetch. And I take all the risks by running it locally. It is based on my preferences so this project is allow list only for now.
If you have feedback or suggestions, feel free.

Right now it doesn't work like that yet, as you've noticed, read until the end if you're interested in contributing to that feature!

---

## What this is

A self-configuring intelligence agent running on Claude. It reads a profile of what you care about, runs targeted searches across the threat landscape, filters the noise, scores what remains against your stack and interests, and writes the report you're reading now.

It maintains its own memory — past stories are logged and deduplicated so you never read the same incident twice unless something genuinely new has happened. Past events are tracked so the radar stays fresh each week.

## What it tracks

- Active exploits, zero-days, ransomware campaigns in the wild
- CVEs touching your stack — flagged **CRITICAL** if you're exposed
- APT activity, nation-state operations, threat actor campaigns
- AI attacks and defenses — the intersection that actually matters
- Events worth showing up to (Brussels → Belgium → Benelux first)

## How to tune it

Write anything in `feedback.md`, or by using the dialog button in the bottom right — plain language, no syntax required. Preferences, corrections, things to add or drop. On the next run it reads your notes, rewrites its own config files, applies the changes in the same run, and clears the file. Your preferences propagate automatically.

## How to run it manually

In Claude Cowork:

> *"Run today's Cyberspace Intelligence briefing. Follow CLAUDE.md exactly."*

---

## About the online version

The dashboard you're reading this on works fully **when self-hosted**. The online/Vercel version is a preview only — several features are currently non-functional in that environment:

- **Write operations don't persist** — Vercel's file system is read-only and ephemeral, so config changes, feedback submissions, and new reports won't survive between requests. A proper persistent backend (e.g. GitHub Contents API for reports, Vercel KV for cache) is needed.
- **Live updates are broken** — the real-time feed relies on WebSockets and a file watcher, neither of which work in a serverless environment. Needs replacing with a polling approach.
- **Feed refresh dies on cold start** — the RSS refresh interval resets with every function invocation. Needs a Vercel Cron Job.
- **Auth is manual** — no login UI exists yet, so the settings panel and feedback command silently fail for unauthenticated sessions.

If any of this sounds like your kind of problem, the source is on GitHub — contributions are very welcome. The roadmap has the full breakdown of what's needed.

**[github.com/Hurleveur/cyberspace](https://github.com/Hurleveur/cyberspace)**

---

*Briefing #001 · System v1.0 · 28 Feb 2026 · The streak starts now.*
