# Cyberspace Dashboard — TODO

> Technical improvements and pending tasks for the dashboard and intelligence system.
> Cross off items here when done, or move them to DASHBOARD-PLAN.md if they grow into bigger features.

---

## Dashboard Improvements

- [x] **Event price display** — Make the **Cost** field more visually prominent in the
  Events panel card. Added badge/pill style: `FREE` in green, `€XX` in amber, visible
  both in the compact list row and the expanded detail card.

- [x] **Map event markers — richer popups** — Event marker popups now show:
  - Event name
  - Date and time
  - Venue / location label
  - Cost (free vs paid badge)
  - Relevance score (★ stars + X/10)
  - A "View details ↓" button to expand the full event card in the right panel

- [x] **Day-synced dashboard** — Navigating between briefing days now syncs:
  - Map markers (shows that day's news markers + persistent event markers)
  - Tasks panel (action items + further reading for the viewed day)
  - Unread counts (badges reflect the active day's markers)
  - Events stay on the map regardless of which day you're viewing

- [x] **Persistent event suggestions** — Events from the last Monday scan now persist
  across all days until the next Monday radar. Accept/Skip state is retained in
  localStorage. Events don't vanish when viewing a non-Monday report.

- [x] **WebSocket respects active date** — If you're reading an older briefing, a new
  report dropping won't auto-jump you away. Shows a toast notification instead.

---

## Phase 3 Completion Assessment

The original Phase 3 plan called for a **bottom-panel command terminal** with typed
commands, tab completion, and history. What was built instead was a **Ctrl+K command
palette** (search across feeds/briefing/events) plus cross-report search. This is a
valid UX pivot, but several Phase 3 deliverables are still missing:

### ✅ Implemented (via command palette / shortcuts)
- Navigation to any panel via keyboard (F/B/E/T/S shortcuts)
- Search across feeds, briefing headings, and events (Ctrl+K palette)
- Cross-report search (briefing search bar → "All" button)
- Visual RSS feed manager in Settings

### ❌ Missing for Phase 3 Completion

- [ ] **Command execution in palette** — The palette is search-only. It should support
  a `>` prefix for command mode (like VS Code), allowing:
  - `> theme green|amber|cyan` — switch accent color live
  - `> status` — show system status (last briefing, feed count, unread count, streak)
  - `> threat` — show current threat level + summary
  - `> feedback <text>` — quick-append to feedback.md without the feedback box
  - `> mark-read` — mark all visible items as read in one action
  - `> refresh feeds` — force re-fetch RSS feeds
  - `> unread` — list all unread items with counts per source

- [ ] **Theme switching** — CSS custom properties are ready for green/amber/cyan
  theming but there's no UI to switch. Needs:
  - Theme selector in Settings (System tab)
  - CSS property overrides for amber (`#ffb300`) and cyan (`#00d4aa`) accents
  - `localStorage` persistence
  - Optional: `> theme` command in palette

- [ ] **"Today" button** — Quick jump back to the latest briefing when viewing an
  older report. Should appear in the briefing nav bar next to the ◄/► arrows.

- [ ] **URL hash date bookmarking** — `#date=2026-03-01` in the URL so you can
  bookmark or share a link to a specific day's briefing. Phase 2 carry-over.

- [ ] **Tab completion / command history** — If implementing the `>` command mode,
  add Up/Down arrow history (localStorage) and basic tab completion for commands.

### 🔶 Phase 2 Carry-overs (affect Phase 3 UX)

- [ ] **Google Calendar integration** — Accept button currently only posts feedback.
  Should create a calendar event (if GCal connected) or download an .ics file.
  This is prerequisite for the event acceptance flow feeling complete.

---

## Intelligence System

*(Add items here as they come up during feedback processing)*
