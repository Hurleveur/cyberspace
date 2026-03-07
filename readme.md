# Cyberspace Intelligence System

A personal intelligence agent that runs every morning at 10am, scans the web for cybersecurity and AI news, and delivers a curated daily briefing + weekly event radar — tailored to your interests, deduplicated against past reports, and rendered on a local dashboard.

The briefs I post are naturally tailored to my interest, which is why this project is invite only so far and not ready for forks yet, I'm still working on it.
If you have suggestions, feel free, and also do read those briefs please.

---

## What it does

Every day at 10am, Claude reads your config files, runs a focused set of web searches, and writes two reports:

- **Daily Briefing** — cybersecurity and AI news filtered and scored against your interests. Covers active threats, breaches, CVEs, APT campaigns, AI security, and your personal tech stack. Includes an action items list and threat level assessment.
- **Event Radar** (Mondays only) — upcoming events in Brussels, Belgium, and Benelux scored for relevance. Checks against your Google Calendar to skip conflicts and events you've already added.

Both reports are saved to `reports/YYYY-MM-DD/` along with a `markers.json` file that feeds the local dashboard map.

---

## How to run it

The system runs automatically via a scheduled task at 10am every day. To trigger a manual run in Claude Cowork, use this prompt:

```
Run today's Cyberspace Intelligence briefing. Follow the instructions in CLAUDE.md exactly.
```

If you want to run just the news without the event scan:

```
Run the daily briefing (news only, skip event discovery). Follow CLAUDE.md.
```

To process feedback you've written and see the config changes applied:

```
Process my feedback.md and run today's Cyberspace briefing. Follow CLAUDE.md.
```

---

## File structure

```
cyberspace/
│
├── CLAUDE.md              ← Master instruction file — Claude reads this first on every run
├── readme.md              ← This file — human documentation
│
├── interests.md           ← Your profile: what you care about, tech stack, event prefs
├── news.md                ← News categories, priority rules, source tiers
├── events.md              ← Event discovery rules, scoring matrix, sources
│
├── feedback.md            ← Write notes here; Claude applies them on next run and clears it
├── seen-events.md         ← Auto-maintained log of events already shown (deduplication)
├── previous-news.md       ← Auto-maintained log of past news stories (deduplication)
│
├── rss.md                 ← RSS feed sources for the live dashboard
│
├── reports/
│   └── YYYY-MM-DD/
│       ├── briefing.md    ← Daily news intelligence report
│       ├── events.md      ← Weekly event radar (Mondays only)
│       └── markers.json   ← Geocoded map markers for the dashboard
│
└── dashboard/             ← Local Node.js dashboard (served on localhost)
```

---

## How to configure it

**Instruction file:** `CLAUDE.md` is what Claude reads as its operational instructions. If you want to change how the system works at a fundamental level — output format, search budget, phase logic — edit that file directly. I recommend starting by introducing your AI to this project and asking it to do an interview to fill these different .md files to your preferences.

**Your profile:** Edit `interests.md` to update what you care about, your tech stack, event preferences, and scoring weights. This is the most important config file — it controls what gets included and what gets filtered out.

**News rules:** Edit `news.md` to change categories, source tiers, or priority levels.

**Event rules:** Edit `events.md` to change discovery sources, scoring criteria, or geographic focus.

**Quick feedback:** The easiest way to adjust things is to write notes in `feedback.md`. Claude will parse them on the next run, update the right config files automatically, apply the changes in the same run, and clear the file. You don't need to know which file to edit — just write what you want changed in plain language.

---

## How the feedback loop works

1. You write anything in `feedback.md` — free text, bullet points, casual notes
2. On the next run, Claude reads it, determines which config files to update, edits them, and clears `feedback.md`
3. The briefing for that run starts with a "📝 Feedback Applied" section listing exactly what changed

This lets you tune the system conversationally without touching config files directly.

---

## Deduplication

The system maintains two auto-managed logs to avoid repetition:

- **`previous-news.md`** — one-line entry per story, pruned to 21 days. Stories already covered are skipped unless there's genuinely new development (new victim, patch released, attribution confirmed).
- **`seen-events.md`** — events shown in the radar are suppressed in future runs unless: registration/deadline is within 48h, significant new info, the entry is over 3 weeks old, or the event is within 7 days.

Both files are updated automatically at the end of each run. Don't edit them manually unless you want to force a story or event to reappear.

---

## Dashboard

A local web dashboard renders the reports at `http://localhost:3000`. It reads `markers.json` from the latest report folder and plots them on an interactive dark-mode map. The dashboard auto-updates when a new report is written.

To start the dashboard: run `npm start` inside the `dashboard/` directory. If you've set up PM2, it starts automatically on login.

---

## System version

Current: **v1.6** — see `CLAUDE.md` for the full changelog.
