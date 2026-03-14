# Contributing to Cyberspace Intelligence System

Thanks for helping improve this project.

This repository handles cybersecurity intelligence workflows and can contain sensitive local context. Good contributions are welcome, but privacy and data hygiene are non-negotiable.

You can AI to code that's totally fine but include the full prompt and reasoning that was used in the head of the PR. If you just told it to "do X" without taking the time to work on a proper solution expect the PR to be closed.

## Core principles

- Protect user privacy first.
- Keep changes focused and reviewable.
- Prefer practical improvements over large speculative rewrites.
- Preserve dashboard compatibility and report format contracts.

## Before you start

1. Read readme.md for architecture and runtime basics.
2. Read CLAUDE.md to understand how report generation logic is structured.
3. Check open issues (or create one) before large changes.

## Development setup

### Prerequisites

- Node.js 20+
- npm 10+
- Windows, macOS, or Linux

### Run locally

1. Install dependencies:

```bash
cd dashboard
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Start dashboard:

```bash
npm start
```

4. Open:

- HTTP: http://localhost:3000
- HTTPS (if certs are configured): https://localhost:4444

## What to work on

Good contribution areas:

- Dashboard UX improvements (feeds, briefing, events, tasks, map, terminal)
- Performance and reliability improvements
- Parsing robustness for briefing and events content
- Security hardening and safe defaults
- Better docs and onboarding
- Test coverage and validation tooling

Please open an issue first for:

- Significant architecture changes
- Data model changes
- Changes to CLAUDE.md output contracts

## Privacy and security requirements

Do not commit personal or generated local intelligence data.

Never commit:

- interests.md
- feedback.md
- news.md
- events.md
- rss.md
- seen-events.md
- previous-news.md
- reports/
- dashboard/.env
- dashboard/data/

Also avoid committing any secrets, API keys, OAuth tokens, or personal identifiers in code, docs, fixtures, and screenshots.

If your change touches data handling, include a short note in your PR describing privacy impact and mitigation.

## Coding expectations

### JavaScript

- Use existing code style and naming patterns.
- Keep functions small and composable.
- Prefer explicit error handling with clear user-facing fallbacks.
- Avoid introducing new dependencies unless clearly justified.

### Frontend

- Keep UI behavior consistent with existing keyboard shortcuts.
- Ensure features work on common desktop viewport sizes.
- Avoid breaking existing panel interactions and saved local state.

### Backend

- Keep API additions minimal and documented.
- Validate and sanitize all request inputs.
- Do not expose local file contents outside intended scope.

## Testing and verification

There is no full automated test suite yet. For now, contributors should run manual checks and include results in the PR.

Minimum checks:

1. Dashboard starts without errors.
2. Feeds load and refresh works.
3. Briefing panel renders at least one report.
4. Events panel loads and filters work.
5. Map loads markers and popups.
6. Task interactions still function.
7. No new console errors in the browser for changed areas.

If you add scripts or tests, document how to run them in the PR.

## Commit and PR guidelines

### Commits

- Keep commits focused and atomic.
- Use clear commit messages.

Recommended format:

- feat: add X
- fix: resolve Y
- docs: update Z
- refactor: simplify A
- chore: maintenance B

### Pull requests

PRs should include:

- Summary of what changed
- Why the change is needed
- Risks and rollback notes
- Manual test evidence
- Screenshots or short clips for UI changes

PR checklist:

- [ ] No sensitive files/data included
- [ ] Scope is focused and minimal
- [ ] Manual validation completed
- [ ] Docs updated where relevant

## Dashboard parser compatibility

Changes affecting events formatting must preserve parser expectations in dashboard/public/js/events.js.

Important:

- Keep field labels exact in generated markdown (When, Where, Relevance, Why this matters).
- Avoid output changes that break the existing regex parser contract.

If parser changes are required, update both generator instructions and parser logic in the same PR.

## Documentation contributions

Documentation improvements are highly encouraged.

If behavior changes, update:

- readme.md for user-facing behavior
- CLAUDE.md when generation rules/contract change
- docs/ files for implementation details

## Code of conduct

Be respectful, constructive, and solution-oriented.

If a discussion gets blocked, propose concrete alternatives with tradeoffs.

## Need help?

Open an issue with:

- Context
- Expected behavior
- Current behavior
- Reproduction steps
- Logs/screenshots (without sensitive data)

Thanks for contributing to Cyberspace.
