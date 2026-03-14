# Event Discovery — Rules & Sources

> This file tells the system WHERE to look for events and HOW to evaluate them.
> Edit sources, scoring rules, or filters anytime — changes take effect on the next run.

---

## Cadence

**Events are checked once per week (Mondays).**
On non-Monday runs, skip the event scan entirely — UNLESS:
- A score 9+/10 event is found incidentally during the daily scan
- An event has a registration deadline within 48h

When the exception fires on a non-Monday, include only that specific event at the
top of the briefing under "⚡ Urgent Event Alert" — do not run a full event scan.

---

## Deduplication — Seen Events Log

Before including any event in the report:
1. Read .
2. If the event is already listed there, **skip it** — seen once = done. Only re-include if:
   - Status is — (undecided) AND a registration/early-bird deadline is within 48h
   - An explicit re-include trigger is set in the trigger column

After writing the report, **update ** by appending every event
that was included in this run:

Also remove any entries whose event date has already passed (clean up stale log).

---

## Calendar Check

After the seen-events filter, for each remaining candidate event:
1. Check Google Calendar for the event date/time.
2. If the event is **already in the calendar**, skip it entirely.
3. If a **different event is booked** at that time, mark it: ⚠️ Conflict — verify before registering.
4. If free, mark it: ✅ Available.

**Calendar intelligence:** Also scan past calendar events to understand what you have
actually attended — this reveals real-world preferences beyond what is written here.

---

## Output Limit

**Maximum 10 events per report.** Priority order when cutting:
1. Events happening soonest come first
2. Higher relevance scores take priority at the same time horizon
3. Cut from "On the Radar" first, never from "This Week"

---

## Discovery Sources

### Primary — always check on Monday runs

| Source | URL | What to search |
|--------|-----|----------------|
| Platform 1 | example.com | Your city + your topic keywords |
| Platform 2 | example.com | Your region — relevant event types |
| Platform 3 | example.com | Your region — relevant event types |

> Add platforms where events in your field are listed.
> Be specific about what to search — topic keywords + location.

### Secondary — check monthly or when primary sources are thin

| Source | URL | Notes |
|--------|-----|-------|
| Source 1 | example.com | Major annual conference in your field |
| Source 2 | example.com | Regional conference |

> Replace with conferences, meetup series, and communities relevant to your focus.

### Signals to watch during daily scans
- Event announcements in your primary news sources
- CFP announcements on social media for relevant conferences

---

## Relevance Scoring

Rate each event on these criteria. **Minimum to include: 6/10.**

| Criterion | Weight | Scoring guide |
|-----------|--------|---------------|
| **Topic match** | 3x | Strong match to interests.md (3) / partial (2) / tangential (1) / off-topic (0) |
| **Proximity** | 2x | Your city (3) / Your country (2) / Neighboring region (1) / Online (1) / Further (0) |
| **Quality signals** | 2x | Known speakers or reputable org (2) / unknown but plausible (1) / red flags (0) |
| **Format** | 1x | Hands-on / workshop (3) / conference / meetup (2) / webinar (1) / vendor pitch (0) |
| **Cost** | 1x | Free (3) / low cost (2) / moderate (1) / expensive (0) — unless exceptional |
| **Timeliness** | 1x | <2 weeks (3) / <1 month (2) / <3 months (1) / further (0) |

**Score 9–10:** Include even outside the weekly Monday run (urgent alert).
**Score 6–8:** Include in the weekly Monday report.
**Score <6:** Discard.

---

## Per-Event Format

```
### [Event Name](link)
**When:** Date, time (timezone)
**Where:** Venue, City (or Online)
**Cost:** Free / €XX
**Calendar:** ✅ Available / ⚠️ Conflict — verify before registering
**Relevance:** ★★★☆☆ (X/10) — one-line reason
**Why this matters:** 1–2 sentences tied to specific interests
**Deadline:** Date ⏰ (only if within 48h)
```

> ⚠️ Dashboard compatibility: use `**Why this matters:**` exactly — not "Why attend:" or "Why:".
> Stars are parsed from `★` characters. Format must be exactly `★★★☆☆ (X/10)`.

---

## Report Structure

```
# Event Radar — {Date}

## ⚡ Urgent Event Alert
{Only on non-Monday runs, only if an exceptional 9+/10 event was found. Otherwise omit.}

## ⏰ Don't Miss (happening this week or deadline within 48h)

## This Month

## On the Radar (1–3 months)

## Conference Calendar
{Annual recurring events — dates, early bird deadlines, CFP windows.}

*Generated {datetime} — next full scan: Monday*
```

---

## Special Rules

- CFP deadlines for relevant conferences: always flag even if the event is far away
- Recurring community events: always include the next occurrence
- **Price accuracy:** Never invent prices. Write "Check website for pricing" if unknown.
- **No unverified data:** Never include events with TBD venue, TBD date, or estimated costs.
