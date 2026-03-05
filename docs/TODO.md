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

- [x] **Command execution in palette** — The palette is search-only. It should support
  a `>` prefix for command mode (like VS Code), allowing:
  - `> theme green|amber|cyan` — switch accent color live
  - `> status` — show system status (last briefing, feed count, unread count, streak)
  - `> threat` — show current threat level + summary
  - `> feedback <text>` — quick-append to feedback.md without the feedback box
  - `> mark-read` — mark all visible items as read in one action
  - `> refresh feeds` — force re-fetch RSS feeds
  - `> unread` — list all unread items with counts per source

- [x] **Theme switching** — CSS custom properties are ready for green/amber/cyan
  theming but there's no UI to switch. Needs:
  - Theme selector in Settings (System tab)
  - CSS property overrides for amber (`#ffb300`) and cyan (`#00d4aa`) accents
  - `localStorage` persistence
  - Optional: `> theme` command in palette

- [x] **"Today" button** — Quick jump back to the latest briefing when viewing an
  older report. Should appear in the briefing nav bar next to the ◄/► arrows.

- [x] **URL hash date bookmarking** — `#date=2026-03-01` in the URL so you can
  bookmark or share a link to a specific day's briefing. Phase 2 carry-over.

- [x] **Tab completion / command history** — `>` command mode now has:
  - Tab completion (completes to longest common prefix across matching command IDs)
  - Up/Down arrow history navigation (persisted to `cyberspace-cmd-history` localStorage)
  - `Shift+>` shortcut (`>` key) opens palette directly in command mode

### 🔶 Phase 2 Carry-overs (affect Phase 3 UX)

- [x] **ICS calendar export** — Accept button now downloads an `.ics` file for the
  accepted event. Parses `When:` field for date/time ranges, falls back to 7 days
  from now if unparseable. Toast confirmation shown on download.

- [ ] **Google Calendar integration** — Full GCal API connect (OAuth). The .ics
  download above covers the offline case. GCal would add click-to-add-to-calendar.

---

## Phase 4 — Visual & Atmosphere Effects

- [x] **Pulsing unread map markers** — Unread markers now animate:
  - All unread markers: `marker-pulse` (2.5s ease-in-out, fill-opacity oscillation)
  - Critical unread markers: `marker-pulse-critical` (1.2s fast, stroke-width expansion)
  - Read markers: no animation (clean state)

- [x] **Desktop notifications for critical threats** — On new briefing arriving via
  WebSocket (when viewing the latest date), if there are unread critical markers,
  sends a native browser notification. Permission requested after 3s on first load.
  Also triggers `MatrixRain.intensify()`.

- [x] **Matrix rain canvas overlay** — Subtle katakana/hex character rain drawn on a
  full-page fixed canvas (`pointer-events: none`, `opacity: 0.045`). Toggleable
  from Settings → System tab. Intensifies (opacity 0.10 for 6s) on CRITICAL threat
  level and on incoming critical notifications. Persisted to localStorage.

### Phase 4 Remaining

- [x] **Glitch text CSS animation** — Apply `glitch` keyframes to threat-level label
  header when threat is HIGH or above. CSS-only, no JS required.

- [x] **Watch Dogs profiler hover** — On hovering a person/org entity in the briefing,
  show a typewriter + scanline hover card (CSS + small JS). Phase 4 atmosphere.

- [x] **Panel slide-in animations** — Animate panels sliding in on first load instead
  of appearing instantly. CSS `@keyframes slideInLeft/Right`.

- [x] **Skeleton loading states** — Show a skeleton shimmer while briefing markdown
  is being fetched, instead of showing nothing.

- [x] **Music player** — Howler.js, looping ambient track in the footer bar.
  Toggle with a ♫ button. Phase 4 original spec.

- [x] **Connection lines between related markers** — Leaflet polylines linking
  markers that share a CVE, threat actor, or campaign. Toggle in map controls.

- [x] **Threat level sparkline** — Mini SVG sparkline in the header showing threat
  level trend across the last 7 reports (green→red gradient).

---

## Intelligence System

*(Add items here as they come up during feedback processing)*
