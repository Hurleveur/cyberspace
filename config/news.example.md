# News Intelligence — Rules & Sources

> This file tells the system WHERE to find news and HOW to filter, prioritize,
> and present it. Edit anytime — changes take effect next run.

---

## Technology Stack Monitoring

> **CRITICAL PRIORITY:** Before the general scan, check whether any tools or platforms
> from interests.md appear in vulnerability disclosures, breach reports, or incident news.
> If found: flag as 🔴 CRITICAL, place at the top of the briefing, generate action tasks.
>
> **Privacy rule:** Never reveal in the briefing which tools are yours. Report generically.

### Tools to monitor
- Add your tools here — copied from interests.md Personal Technology Stack

---

## Priority Sources

### Primary news sources

| Source | URL | Strength |
|--------|-----|---------|
| Source 1 | example.com | Why you trust it |
| Source 2 | example.com | Why you trust it |
| Source 3 | example.com | Why you trust it |

### Official / authoritative

| Source | URL | Strength |
|--------|-----|---------|
| Source 1 | example.com | Government or standards body |
| Source 2 | example.com | Industry authority |

### Analysis & research

| Source | URL | Strength |
|--------|-----|---------|
| Source 1 | example.com | In-depth analysis |

---

## Story Categories

Each item belongs to exactly one category. Define the categories that matter for your domain:

1. **CATEGORY 1** — Description
2. **CATEGORY 2** — Description
3. **CATEGORY 3** — Description
4. **CATEGORY 4** — Description
5. **STACK MONITORING** — Any incident involving your monitored tools → always CRITICAL

---

## Priority Levels

| Priority | Criteria | Include? |
|----------|----------|----------|
| 🔴 CRITICAL | Immediate action needed, major incident | Always — top of report |
| 🔴 CRITICAL | **Any incident involving monitored tech stack** | Always — top of report |
| 🟠 HIGH | Significant development, important trend | Always |
| 🟡 MEDIUM | Noteworthy, matches interests | Yes |
| 🟢 LOW | Background / minor | Further Reading only |

---

## Story Format

```
#### [Headline](source_url)
**Source:** Name · **Published:** YYYY-MM-DD
**Priority:** 🔴/🟠/🟡 · **Category:** Category name

2–3 sentences: what happened and what to watch or do next.
```

---

## Quality Rules

- No fluff. No duplication. No repeats (cross-check previous-news.md).
- Verify extraordinary claims across 2+ sources.
- Own words — never copy-paste article text.
- Action bias: end summaries with what to do or watch, not just what happened.
- Balance stack-specific alerts with the biggest global stories of the day.
- LinkedIn-worthy flag: truly major global impact only. Max 1–2 per day.

---

## Daily Metrics

Track real numbers from authoritative sources:
- Notable new items disclosed
- Actively exploited / urgent issues
- Major incidents reported
- Active campaigns flagged
