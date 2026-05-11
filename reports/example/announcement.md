---
title: "System Online — Cyberspace Intelligence v1.0"
type: system
author: Hurleveur
date: 2026-03-19
---

https://www.github.com/Hurleveur/cyberspace

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

You're looking at **Cyberspace** — a personal threat intelligence terminal. It combines an rss feed list with more advanced agent research.

Here is the concept:
Every morning at 10:00 (or one morning out of two because it's a lot of briefings!), my node wakes up, ghosts through the open web, and drops a briefing for you.

---

## What this is

A self-configuring intelligence agent running on Claude. It reads a profile of what you care about, runs targeted searches across the threat landscape, filters the noise, scores what remains against your stack and interests, and writes the report you're reading now.

It maintains its own memory — past stories are logged and deduplicated so you never read the same incident twice unless something genuinely new has happened. Past events are tracked so the radar stays fresh each week.

## What it tracks

- Active exploits, zero-days, ransomware campaigns in the wild
- CVEs touching your stack — flagged **CRITICAL** if you're exposed, although I'd recommend using https://vulnerability.circl.lu/user/notifications/create for that.
- APT activity, nation-state operations, threat actor campaigns
- AI attacks and defenses — the intersection that actually matters
- Events worth showing up to, near you and according to your preferences, once a week

## How to tune it

Using the dialog button in the bottom right to give feedback for the next run. Preferences, corrections, things to add or drop. On the next run it reads your notes, rewrites its own config files, applies the changes in the same run, and clears the file. Your preferences propagate automatically.

## How to run it manually

In Claude Cowork, first copy paste the docs/claude-cowork.md file, customize your preferences by asking the AI to onboard you to this project and setup the /config fully, then let it run every wherever you want.

---

## About the online version

The dashboard you're reading this on works fully **when self-hosted**. I do not provide a claude api to do research for you as per the files here, you're supposed to do this on your own.

- The RSS feeds can be customized once you log in with google oauth and go to the settings. They will refresh every 5 minutes.
- The radio is functional!
- The reports you see are mine, I pushed them to showcase what this can do.

The roadmap has many improvements that could be nice, and I don't mind AI submissions so long as it is intentional and not done by someone who has never seen code before.

https://www.github.com/Hurleveur/cyberspace

---

*Briefing #001 · System v2.0 · 19 March 2026 · The streak starts now.*
