# Cyberspace Intelligence System

A personal intelligence agent that runs every morning at 10am, scans the web for cybersecurity and AI news, and delivers a curated daily briefing + weekly event radar — tailored to your interests, deduplicated against past reports, and rendered on a local dashboard. No personal information should ever leave your computer, but you should trust the AI running the briefs.

I'm currently making the briefs tailored to my interest, which is why this project is invite only so far and not ready for forks yet.
If you have suggestions, feel free.


# How to start it

Start it by starting dashboard/server.js or use the install-service.js to set it up to autostart on windows. On linux you can use pm2.
The dashboard will be available at `http://localhost:3000` by default (or `https://localhost:4444` if HTTPS is set up — see the Dashboard section below).

---

## What it does

You can find the claude cowork prompt I use (with sonnet 4.6) in docs/claude-cowork.md

Claude reads your config files when the task is scheduled, runs a focused set of web searches, and writes two reports:

- **Daily Briefing** — cybersecurity and AI news filtered and scored against your interests. Covers active threats, breaches, CVEs, APT campaigns, AI security, and your personal tech stack. Includes an action items list and threat level assessment.
- **Event Radar** (Mondays only) — upcoming events in Brussels, Belgium, and Benelux scored for relevance. Checks against your Google Calendar to skip conflicts and events you've already added - this is NOT pushed to the github for you guys.

Both reports are saved to `reports/YYYY-MM-DD/` along with a `markers.json` file that feeds the local dashboard map.

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
├── docs/
│   └── cryptpad-projects.md  ← CryptPad Kanban integration guide
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

## Projects & Collaboration

The dashboard includes a **Projects panel** (press `P` or click the 🗂 button) that embeds CryptPad Kanban boards directly alongside the intelligence feed. You can manage multiple boards with a project switcher, store project metadata (name, members, URLs) on the server so the whole team sees the same list, and collaborate in real time — CryptPad handles the encrypted task data, the dashboard provides the scaffolding around it.

See **[docs/cryptpad-projects.md](docs/cryptpad-projects.md)** for full setup instructions, including how to get your CryptPad board URLs, add projects, share access with collaborators, and troubleshoot iframe embedding issues.

---

## Dashboard

A local web dashboard renders the reports at `http://localhost:3000`. It reads `markers.json` from the latest report folder and plots them on an interactive dark-mode map. The dashboard auto-updates when a new report is written.

To start the dashboard: run `npm start` inside the `dashboard/` directory. If you've set up PM2, it starts automatically on login.

### HTTPS

The dashboard supports HTTPS for embedding CryptPad documents, which require a secure origin. Run `setup-https.ps1` once (as administrator) to generate a self-signed certificate and import it into the Windows trust store.

When certificates are present the server starts two listeners:

| Port | Protocol | Role |
|------|----------|------|
| `:3000` | HTTP | Redirects to HTTPS |
| `:4444` | HTTPS | Main dashboard |

Visiting `http://localhost:3000` will automatically redirect you to `https://localhost:4444`. Without certificates the server runs plain HTTP on `:3000` only, exactly as before. To temporarily force HTTP mode, rename `dashboard/certs/` to `dashboard/certs.bak/` and restart.

---

## System version

Current: **v1.6** — see `CLAUDE.md` for the full changelog.
