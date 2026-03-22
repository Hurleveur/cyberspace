/**
 * Events panel — renders events from events.md as a compact list.
 * Hover/click expands inline detail card with full info + accept/skip.
 */
const Events = {
  events: [],
  filteredEvents: [],
  expandedId: null,
  sourceDate: null,   // most recent date that had an events.md
  eventDates: [],     // all dates that had an events.md (for map marker merging)
  dateSortAsc: true,  // toggle for date sort direction

  async init() {
    this.bindFilterEvents();
    await this.load();
  },

  bindFilterEvents() {
    document.getElementById('events-filter-urgency').addEventListener('change', () => this.applyFilters());
    document.getElementById('events-filter-cost').addEventListener('change', () => this.applyFilters());
    document.getElementById('events-filter-score').addEventListener('change', () => this.applyFilters());
    document.getElementById('events-filter-accepted').addEventListener('change', () => this.applyFilters());
    document.getElementById('events-filter-skipped').addEventListener('change', () => this.applyFilters());
    document.getElementById('events-filter-past').addEventListener('change', () => this.applyFilters());
    document.getElementById('events-sort-date').addEventListener('click', () => this.sortByDate());
  },

  /**
   * Load and merge events from ALL reports that have an events.md so that
   * events accumulate across weeks until the user explicitly accepts or skips
   * them. Newest events.md wins on a per-ID conflict.
   */
  async load() {
    const container = document.getElementById('events-list');
    try {
      let filesByDate = {};
      let allEventsByDate = [];

      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        const { dates, filesByDate: fbd } = data;
        filesByDate = fbd || {};

        if (dates && dates.length > 0) {
          // Use the filesByDate manifest to only fetch dates that actually have events.md
          const datesWithEvents = fbd
            ? dates.filter(d => fbd[d]?.['events.md'])
            : dates;
          const fetchResults = await Promise.all(datesWithEvents.map(async (date) => {
            const evRes = await fetch(`/api/file?path=reports/${date}/events.md`);
            if (evRes.ok) {
              const markdown = await evRes.text();
              return { date, events: this.parseEvents(markdown) };
            }
            return null;
          }));
          allEventsByDate = fetchResults.filter(Boolean);
        }
      }

      // No real events found — fall back to example data
      if (allEventsByDate.length === 0) {
        const exRes = await fetch('/api/file?path=reports/example/events.md');
        if (exRes.ok) {
          const markdown = await exRes.text();
          allEventsByDate = [{ date: 'example', events: this.parseEvents(markdown) }];
          filesByDate = { example: { 'events.md': true } };
        } else {
          container.innerHTML = '<div class="empty-state">No event radar found in any report.</div>';
          return;
        }
      }

      // Merge: newest-first (dates array is already sorted newest-first).
      // First occurrence of each ID wins — so the most recent version of an
      // event takes precedence if it appears in multiple radars.
      const seen = new Set();
      const merged = [];
      for (const { events } of allEventsByDate) {
        for (const ev of events) {
          if (!seen.has(ev.id)) {
            seen.add(ev.id);
            merged.push(ev);
          }
        }
      }

      this.events = merged;
      this.sourceDate = allEventsByDate[0].date; // most recent events.md date
      this.eventDates = allEventsByDate.map(e => e.date);

      // Share with App so the map knows which dates to pull event markers from
      if (typeof App !== 'undefined') {
        App.eventsSourceDate = this.sourceDate;
        App.eventsSourceDates = this.eventDates;
        App.filesByDate = filesByDate || {};
      }

      if (this.events.length === 0) {
        container.innerHTML = '<div class="empty-state">No events found in any radar.</div>';
        return;
      }

      this.applyFilters();
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Error loading events: ${err.message}</div>`;
    }
  },

  parseEvents(markdown) {
    const events = [];
    const sections = markdown.split(/^### /m).slice(1);

    for (const section of sections) {
      const lines = section.trim().split('\n');
      const firstLine = lines[0] || '';

      const linkMatch = firstLine.match(/\[([^\]]+)\]\(([^)]+)\)/);
      const name = linkMatch ? linkMatch[1] : firstLine.replace(/\[|\]|\(.*\)/g, '').trim();
      const url = linkMatch ? linkMatch[2] : '';

      if (!name) continue;

      const event = {
        id: `event-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        name,
        url,
        when: this.extractField(section, 'When'),
        where: this.extractField(section, 'Where'),
        cost: this.extractField(section, 'Cost'),
        calendar: this.extractField(section, 'Calendar'),
        relevance: this.extractField(section, 'Relevance'),
        why: this.extractField(section, 'Why this matters'),
        deadline: this.extractField(section, 'Deadline'),
        score: 0,
      };

      const scoreMatch = (event.relevance || '').match(/(\d+)\/10/);
      if (scoreMatch) event.score = parseInt(scoreMatch[1]);

      const starCount = (event.relevance || '').split('★').length - 1;
      event.stars = starCount || Math.round(event.score / 2);

      // Parse deadline date for filtering/badges
      event.deadlineDate = this.parseDeadlineDate(event.deadline);

      events.push(event);
    }

    return events;
  },

  extractField(text, fieldName) {
    const regex = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*([^\\r\\n]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  },

  parseDeadlineDate(deadline) {
    if (!deadline) return null;
    // Strip emoji and extra whitespace
    const cleaned = deadline.replace(/[⏰🔔⚠️]/g, '').trim();
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  },

  getDeadlineBadge(event) {
    if (!event.deadlineDate) return '';
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const deadline = new Date(event.deadlineDate);
    deadline.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((deadline - now) / 86400000);

    if (daysLeft < 0) return '<span class="deadline-badge deadline-past">CLOSED</span>';
    if (daysLeft === 0) return '<span class="deadline-badge deadline-urgent">TODAY</span>';
    if (daysLeft === 1) return '<span class="deadline-badge deadline-soon">TOMORROW</span>';
    if (daysLeft <= 3) return `<span class="deadline-badge deadline-close">${daysLeft}d LEFT</span>`;
    if (daysLeft <= 7) return `<span class="deadline-badge deadline-week">${daysLeft}d</span>`;
    return '';
  },

  /**
   * Return an HTML badge for the cost field.
   * GREEN pill for free events, AMBER pill for paid.
   */
  getCostBadge(cost) {
    if (!cost) return '';
    if (/free/i.test(cost)) {
      return '<span class="cost-badge cost-free">FREE</span>';
    }
    // Try to extract a price like €50, EUR 200, $100
    const priceMatch = cost.match(/[€$£]\s*\d[\d.,]*/i) || cost.match(/\d[\d.,]*\s*(?:EUR|USD|GBP)/i);
    if (priceMatch) {
      return `<span class="cost-badge cost-paid">${this.escapeHtml(priceMatch[0].trim())}</span>`;
    }
    // Fallback for any non-free cost text
    return `<span class="cost-badge cost-paid">${this.escapeHtml(cost.slice(0, 20))}</span>`;
  },

  applyFilters() {
    const urgency = document.getElementById('events-filter-urgency').value;
    const cost = document.getElementById('events-filter-cost').value;
    const minScore = parseInt(document.getElementById('events-filter-score').value) || 0;
    const hideAccepted = document.getElementById('events-filter-accepted').checked;
    const hideSkipped = document.getElementById('events-filter-skipped').checked;
    const hidePast = document.getElementById('events-filter-past').checked;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    this.filteredEvents = this.events.filter(event => {
      const isAccepted = localStorage.getItem(`event-accepted-${event.id}`);
      const isSkipped = localStorage.getItem(`event-skipped-${event.id}`);
      if (hideAccepted && isAccepted) return false;
      if (hideSkipped && isSkipped) return false;

      // Past-event filter — hide if the event end date is before today
      if (hidePast) {
        const parsed = this.parseEventDateTime(event.when);
        if (parsed) {
          const end = new Date(parsed.end);
          end.setHours(0, 0, 0, 0);
          if (end < today) return false;
        }
      }

      // Score filter
      if (event.score < minScore) return false;

      // Cost filter
      if (cost === 'free' && !/free/i.test(event.cost)) return false;
      if (cost === 'paid' && /free/i.test(event.cost)) return false;

      // Urgency filter
      if (urgency && event.deadlineDate) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const deadline = new Date(event.deadlineDate);
        deadline.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((deadline - now) / 86400000);
        if (urgency === '48h' && daysLeft > 2) return false;
        if (urgency === 'week' && daysLeft > 7) return false;
      } else if (urgency) {
        // No deadline date — can't match urgency filter
        return false;
      }

      return true;
    });

    // Always apply the current sort direction (default: chronological ascending)
    const parseDate = (ev) => {
      const parsed = this.parseEventDateTime(ev.when);
      return parsed ? parsed.start.getTime() : Infinity;
    };
    this.filteredEvents.sort((a, b) => {
      const da = parseDate(a), db = parseDate(b);
      return this.dateSortAsc ? da - db : db - da;
    });

    this.render();
  },

  /** Sort filteredEvents in-place by relevance score (highest first) and re-render. */
  sortByScore() {
    this.filteredEvents.sort((a, b) => (b.score || 0) - (a.score || 0));
    this.render();
  },

  /** Toggle date sort direction and re-filter (sort is applied inside applyFilters). */
  sortByDate() {
    this.dateSortAsc = !this.dateSortAsc;
    const btn = document.getElementById('events-sort-date');
    if (btn) btn.textContent = this.dateSortAsc ? 'Date ↑' : 'Date ↓';
    this.applyFilters();
  },

  render() {
    const container = document.getElementById('events-list');
    const events = this.filteredEvents;

    if (events.length === 0) {
      container.innerHTML = '<div class="empty-state">No events match your filters.</div>';
      return;
    }

    let html = '';
    for (const event of events) {
      const starsStr = '★'.repeat(Math.min(event.stars, 5)) + '☆'.repeat(Math.max(0, 5 - event.stars));
      const isExpanded = this.expandedId === event.id;
      const isAccepted = localStorage.getItem(`event-accepted-${event.id}`);
      const isSkipped = localStorage.getItem(`event-skipped-${event.id}`);
      let stateClass = '';
      if (isAccepted) stateClass = 'event-accepted';
      if (isSkipped) stateClass = 'event-skipped';

      const deadlineBadge = this.getDeadlineBadge(event);
      const costBadge = this.getCostBadge(event.cost);

      let inlineActions = '';
      if (!isAccepted && !isSkipped) {
        inlineActions = `<div class="event-inline-actions">
          <button class="event-btn-accept-inline" data-id="${event.id}" title="Accept">&#x2713;</button>
          <button class="event-btn-skip-inline" data-id="${event.id}" title="Skip">&#x2717;</button>
        </div>`;
      } else if (isAccepted) {
        inlineActions = '<span class="event-inline-status accepted">&#x2713;</span>';
      } else {
        inlineActions = '<span class="event-inline-status skipped">&#x2717;</span>';
      }

      html += `
        <div class="event-item ${stateClass}" data-id="${event.id}">
          <div class="event-item-body">
            <div class="event-item-name">${costBadge}${this.escapeHtml(event.name)}${deadlineBadge}</div>
            <div class="event-item-meta">${this.escapeHtml(event.when || 'Date TBD')} · ${this.escapeHtml(event.where || 'Location TBD')}</div>
          </div>
          <div class="event-stars">${starsStr}</div>
          ${inlineActions}
          <div class="event-arrow">${isExpanded ? '▾' : '›'}</div>
        </div>
        <div class="event-detail ${isExpanded ? 'active' : ''}" id="detail-${event.id}">
          ${this.renderDetail(event, isAccepted, isSkipped)}
        </div>
      `;
    }

    container.innerHTML = html;

    // Staggered slide-in animation for event items
    if (typeof VisualFX !== 'undefined') {
      VisualFX.staggerItems(container.querySelectorAll('.event-item'), 'event-anim-in');
    }

    // Bind click handlers
    container.querySelectorAll('.event-item').forEach(el => {
      el.addEventListener('click', () => this.toggleDetail(el.dataset.id));
    });
    container.querySelectorAll('.event-btn-accept, .event-btn-accept-inline').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.acceptEvent(btn.dataset.id); });
    });
    container.querySelectorAll('.event-btn-skip, .event-btn-skip-inline').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.skipEvent(btn.dataset.id); });
    });
    container.querySelectorAll('.event-btn-ics').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); const ev = this.events.find(x => x.id === btn.dataset.id); if (ev) this.downloadIcs(ev); });
    });
    container.querySelectorAll('.event-btn-gcal').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); });
    });
    container.querySelectorAll('.event-btn-undo').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.undoEvent(btn.dataset.id); });
    });
  },

  renderDetail(event, isAccepted, isSkipped) {
    let html = '';
    if (event.when) html += `<div class="event-detail-field"><span class="event-detail-label">When: </span><span class="event-detail-value">${this.escapeHtml(event.when)}</span></div>`;
    if (event.where) html += `<div class="event-detail-field"><span class="event-detail-label">Where: </span><span class="event-detail-value">${this.escapeHtml(event.where)}</span></div>`;
    if (event.cost) html += `<div class="event-detail-field"><span class="event-detail-label">Cost: </span><span class="event-detail-value">${this.getCostBadge(event.cost)}</span></div>`;
    if (event.relevance) html += `<div class="event-detail-field"><span class="event-detail-label">Relevance: </span><span class="event-detail-value">${this.escapeHtml(event.relevance)}</span></div>`;
    if (event.calendar) html += `<div class="event-detail-field"><span class="event-detail-label">Calendar: </span><span class="event-detail-value">${this.escapeHtml(event.calendar)}</span></div>`;
    if (event.deadline) html += `<div class="event-detail-field"><span class="event-detail-label">Deadline: </span><span class="event-detail-value">${this.escapeHtml(event.deadline)}</span></div>`;
    if (event.why) html += `<div class="event-detail-why">${this.escapeHtml(event.why)}</div>`;
    if (event.url) {
      const gcalUrl = this.generateGoogleCalendarUrl(event);
      html += `<div class="event-detail-field event-links-row">
        <a href="${this.escapeHtml(event.url)}" target="_blank" style="color:var(--event-color)">Event page ↗</a>
        <span class="event-calendar-actions">
          <a href="${gcalUrl}" target="_blank" class="event-btn-gcal" title="Add to Google Calendar">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5v-5z"/></svg>
            Google Calendar
          </a>
          <button class="event-btn-ics" data-id="${event.id}" title="Download .ics file">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            .ics
          </button>
        </span>
      </div>`;
    }

    if (!isAccepted && !isSkipped) {
      html += `
        <div class="event-actions">
          <button class="event-btn-accept" data-id="${event.id}">Accept</button>
          <button class="event-btn-skip" data-id="${event.id}">Skip</button>
        </div>
      `;
    } else if (isAccepted) {
      html += `
        <div class="event-decided-row">
          <span class="event-decided-label accepted">✓ Accepted</span>
          <button class="event-btn-undo" data-id="${event.id}" data-action="undo-accepted">change mind</button>
        </div>
      `;
    } else {
      html += `
        <div class="event-decided-row">
          <span class="event-decided-label skipped">✕ Skipped</span>
          <button class="event-btn-undo" data-id="${event.id}" data-action="undo-skipped">change mind</button>
        </div>
      `;
    }

    return html;
  },

  toggleDetail(id) {
    if (this.expandedId === id) {
      this.expandedId = null;
    } else {
      this.expandedId = id;
    }
    document.querySelectorAll('.event-detail').forEach(el => {
      el.classList.toggle('active', el.id === `detail-${this.expandedId}`);
    });
    // Update arrows
    document.querySelectorAll('.event-item').forEach(el => {
      const arrow = el.querySelector('.event-arrow');
      if (arrow) arrow.textContent = el.dataset.id === this.expandedId ? '▾' : '›';
    });
  },

  scrollToEvent(markerId) {
    // Fuzzy match: try exact, then prefix match
    let event = this.events.find(e => e.id === markerId);
    if (!event) event = this.events.find(e => e.id.startsWith(markerId) || markerId.startsWith(e.id));
    if (!event) return;
    this.expandedId = event.id;
    this.render();
    const el = document.querySelector(`.event-item[data-id="${event.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-flash');
    }
  },

  async acceptEvent(id) {
    const event = this.events.find(e => e.id === id);
    if (!event) return;
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `EVENT ACCEPTED: "${event.name}" (${event.when}, ${event.where})` }),
      });
      localStorage.setItem(`event-accepted-${id}`, 'true');
      if (typeof LevelSystem !== 'undefined') LevelSystem.reward('event', id);
    } catch (err) {
      console.error('[events] Accept error:', err);
    } finally {
      this.render();
      App.updateUnreadCount();
      if (typeof MapView !== 'undefined') MapView.removeMarker(id);
    }
    App.toast(`✓ Accepted — ${event.name.slice(0, 30)}`, 'briefing');
  },

  undoEvent(id) {
    localStorage.removeItem(`event-accepted-${id}`);
    localStorage.removeItem(`event-skipped-${id}`);
    this.render();
    App.updateUnreadCount();
    const event = this.events.find(e => e.id === id);
    if (event && typeof MapView !== 'undefined') MapView.addOrUpdateMarker?.(id);
  },

  async skipEvent(id) {
    const event = this.events.find(e => e.id === id);
    if (!event) return;
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `EVENT SKIPPED: "${event.name}" — not interested` }),
      });
      localStorage.setItem(`event-skipped-${id}`, 'true');
      this.render();
      App.updateUnreadCount();
      if (typeof MapView !== 'undefined') MapView.removeMarker(id);
    } catch (err) {
      console.error('[events] Skip error:', err);
    }
  },

  getUnreadCount() {
    return this.events.filter(e =>
      !localStorage.getItem(`event-accepted-${e.id}`) &&
      !localStorage.getItem(`event-skipped-${e.id}`)
    ).length;
  },

  async refresh() {
    this.expandedId = null;
    await this.load();
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },

  // ── Date/Time Parsing ──────────────────────────────────────────────────────

  parseEventDateTime(when) {
    let text = when
      .replace(/[⏰🎫🔔⚠️]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Recurring events have no fixed date
    if (/\bevery\b/i.test(text)) return null;

    // 1. Extract time info
    let startH = null, startM = null, endH = null, endM = null;
    const range24 = text.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})(\s*(?:AM|PM))?/i);
    if (range24) {
      startH = parseInt(range24[1]); startM = parseInt(range24[2]);
      endH = parseInt(range24[3]); endM = parseInt(range24[4]);
      text = text.replace(range24[0], ' ');
    } else {
      const single = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (single) {
        startH = parseInt(single[1]); startM = parseInt(single[2]);
        if (single[3]) {
          const ampm = single[3].toUpperCase();
          if (ampm === 'PM' && startH !== 12) startH += 12;
          if (ampm === 'AM' && startH === 12) startH = 0;
        }
        endH = startH + 2; endM = startM;
        text = text.replace(single[0], ' ');
      }
    }

    // 2. Clean non-date tokens
    text = text
      .replace(/·/g, ' ')
      .replace(/\b(?:CET|CEST|GMT|UTC|BST|EST|PST|CST|MST|EDT|PDT|EET|EEST)\b/gi, ' ')
      .replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi, ' ')
      .replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi, ' ')
      .replace(/\bStarts?\b/gi, ' ')
      .replace(/\(.*?\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 3. Handle date ranges — take first date
    // Format: Month DD–DD, YYYY (e.g. "June 22–26, 2026")
    const monthDayRange = text.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*)\s+(\d{1,2})\s*[-–]\s*\d{1,2},?\s+(\d{4})/i);
    if (monthDayRange) {
      text = `${monthDayRange[1]} ${monthDayRange[2]} ${monthDayRange[3]}`;
    }
    // Format: DD–DD Month YYYY (e.g. "22–26 June 2026")
    const dayRange = text.match(/(\d{1,2})\s*[-–]\s*\d{1,2}\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*)\s+(\d{4})/i);
    if (dayRange) {
      text = `${dayRange[1]} ${dayRange[2]} ${dayRange[3]}`;
    }
    const crossRange = text.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*)\s*[-–]\s*\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})/i);
    if (crossRange && !dayRange) {
      text = `${crossRange[1]} ${crossRange[2]}`;
    }

    // 4. Final cleanup
    text = text.replace(/^[\s,–-]+/, '').replace(/[\s,–-]+$/, '').replace(/\s+/g, ' ').trim();

    // 5. Parse the date string
    let baseDate = new Date(text);
    if (isNaN(baseDate.getTime()) && !/\d{4}/.test(text)) {
      baseDate = new Date(text + ' ' + new Date().getFullYear());
    }
    if (isNaN(baseDate.getTime())) return null;

    // 6. Build result
    if (startH !== null) {
      const start = new Date(baseDate); start.setHours(startH, startM, 0, 0);
      const end = new Date(baseDate); end.setHours(endH, endM, 0, 0);
      return { start, end, allDay: false };
    }
    const end = new Date(baseDate); end.setDate(end.getDate() + 1);
    return { start: baseDate, end, allDay: true };
  },

  // ── ICS Generation ─────────────────────────────────────────────────────────

  generateIcs(event) {
    const pad = (n) => String(n).padStart(2, '0');
    const toIcsDt = (date) =>
      `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
    const toIcsDtUtc = (date) =>
      `${date.getUTCFullYear()}${pad(date.getUTCMonth()+1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;

    const now = new Date();
    const stamp = toIcsDtUtc(now) + 'Z';
    const parsed = event.when ? this.parseEventDateTime(event.when) : null;

    if (parsed) {
      if (parsed.allDay) {
        const y = parsed.start.getFullYear(), m = pad(parsed.start.getMonth()+1), d = pad(parsed.start.getDate());
        const dtLines = [
          `DTSTART;VALUE=DATE:${y}${m}${d}`,
          `DTEND;VALUE=DATE:${parsed.end.getFullYear()}${pad(parsed.end.getMonth()+1)}${pad(parsed.end.getDate())}`,
        ];
        return this._buildIcs(event, dtLines, stamp);
      }
      return this._buildIcs(event, [`DTSTART:${toIcsDt(parsed.start)}`, `DTEND:${toIcsDt(parsed.end)}`], stamp);
    }

    // Fallback: all-day event for today (not a fake future date)
    const today = new Date(now);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const pad2 = pad;
    const dtLines = [
      `DTSTART;VALUE=DATE:${today.getFullYear()}${pad2(today.getMonth()+1)}${pad2(today.getDate())}`,
      `DTEND;VALUE=DATE:${tomorrow.getFullYear()}${pad2(tomorrow.getMonth()+1)}${pad2(tomorrow.getDate())}`,
    ];
    return this._buildIcs(event, dtLines, stamp);
  },

  _buildIcs(event, dtLines, stamp) {
    const esc = (s) => (s || '')
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\n/g, '\\n');
    const uid = `${event.id}-${Date.now()}@cyberspace-dashboard`;
    const description = [
      event.why,
      event.url ? `Event page: ${event.url}` : '',
      event.cost ? `Cost: ${event.cost}` : '',
      event.relevance ? `Relevance: ${event.relevance}` : '',
    ].filter(Boolean).join('\n');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Cyberspace Intelligence//Dashboard//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      ...dtLines,
      `DTSTAMP:${stamp}`,
      `UID:${uid}`,
      `SUMMARY:${esc(event.name)}`,
      event.where ? `LOCATION:${esc(event.where)}` : null,
      description ? `DESCRIPTION:${esc(description)}` : null,
      event.url ? `URL:${event.url}` : null,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
  },

  downloadIcs(event) {
    const ics = this.generateIcs(event);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `${event.name.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 50)}.ics`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // ── Google Calendar URL ────────────────────────────────────────────────────

  generateGoogleCalendarUrl(event) {
    const pad = (n) => String(n).padStart(2, '0');
    const toGcalDt = (d) => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const toGcalDate = (d) => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;

    let dates = '';
    const parsed = event.when ? this.parseEventDateTime(event.when) : null;
    if (parsed) {
      dates = parsed.allDay
        ? `${toGcalDate(parsed.start)}/${toGcalDate(parsed.end)}`
        : `${toGcalDt(parsed.start)}/${toGcalDt(parsed.end)}`;
    }

    const description = [
      event.why,
      event.url ? `Event page: ${event.url}` : '',
      event.cost ? `Cost: ${event.cost}` : '',
      event.relevance ? `Relevance: ${event.relevance}` : '',
    ].filter(Boolean).join('\n');

    const params = new URLSearchParams();
    params.set('action', 'TEMPLATE');
    params.set('text', event.name || 'Event');
    if (dates) params.set('dates', dates);
    if (event.where) params.set('location', event.where);
    if (description) params.set('details', description);

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  },
};