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

  async init() {
    this.bindFilterEvents();
    await this.load();
  },

  bindFilterEvents() {
    document.getElementById('events-filter-urgency').addEventListener('change', () => this.applyFilters());
    document.getElementById('events-filter-cost').addEventListener('change', () => this.applyFilters());
    document.getElementById('events-filter-score').addEventListener('change', () => this.applyFilters());
  },

  /**
   * Load and merge events from ALL reports that have an events.md so that
   * events accumulate across weeks until the user explicitly accepts or skips
   * them. Newest events.md wins on a per-ID conflict.
   */
  async load() {
    const container = document.getElementById('events-list');
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) {
        container.innerHTML = '<div class="empty-state">No event reports available yet.</div>';
        return;
      }
      const { dates } = await res.json();
      if (!dates || dates.length === 0) {
        container.innerHTML = '<div class="empty-state">No event reports available yet.</div>';
        return;
      }

      // Fetch every events.md that exists across all report dates
      const allEventsByDate = [];
      for (const date of dates) {
        const evRes = await fetch(`/api/file?path=reports/${date}/events.md`);
        if (evRes.ok) {
          const markdown = await evRes.text();
          allEventsByDate.push({ date, events: this.parseEvents(markdown) });
        }
      }

      if (allEventsByDate.length === 0) {
        container.innerHTML = '<div class="empty-state">No event radar found in any report.</div>';
        return;
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
    const regex = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?:\\n|$)`, 'i');
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

    this.filteredEvents = this.events.filter(event => {
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

    this.render();
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

      html += `
        <div class="event-item ${stateClass}" data-id="${event.id}">
          <div class="event-item-body">
            <div class="event-item-name">${costBadge}${this.escapeHtml(event.name)}${deadlineBadge}</div>
            <div class="event-item-meta">${this.escapeHtml(event.when || 'Date TBD')} · ${this.escapeHtml(event.where || 'Location TBD')}</div>
          </div>
          <div class="event-stars">${starsStr}</div>
          <div class="event-arrow">${isExpanded ? '▾' : '›'}</div>
        </div>
        <div class="event-detail ${isExpanded ? 'active' : ''}" id="detail-${event.id}">
          ${this.renderDetail(event, isAccepted, isSkipped)}
        </div>
      `;
    }

    container.innerHTML = html;

    // Bind click handlers
    container.querySelectorAll('.event-item').forEach(el => {
      el.addEventListener('click', () => this.toggleDetail(el.dataset.id));
    });
    container.querySelectorAll('.event-btn-accept').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.acceptEvent(btn.dataset.id); });
    });
    container.querySelectorAll('.event-btn-skip').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.skipEvent(btn.dataset.id); });
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
    if (event.url) html += `<div class="event-detail-field"><a href="${this.escapeHtml(event.url)}" target="_blank" style="color:var(--event-color)">Event page ↗</a></div>`;

    if (!isAccepted && !isSkipped) {
      html += `
        <div class="event-actions">
          <button class="event-btn-accept" data-id="${event.id}">Accept</button>
          <button class="event-btn-skip" data-id="${event.id}">Skip</button>
        </div>
      `;
    } else if (isAccepted) {
      html += `<div style="margin-top:8px;color:var(--accent);font-size:11px;">Accepted</div>`;
    } else {
      html += `<div style="margin-top:8px;color:var(--text-dim);font-size:11px;">Skipped</div>`;
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
      this.downloadIcs(event);
      this.render();
      App.updateUnreadCount();
      App.toast(`✓ Accepted — ${event.name.slice(0, 30)}  (.ics downloaded)`, 'briefing');
    } catch (err) {
      console.error('[events] Accept error:', err);
    }
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

  // ── ICS Generation ─────────────────────────────────────────────────────────

  generateIcs(event) {
    const pad = (n) => String(n).padStart(2, '0');
    const toIcsDt = (date) =>
      `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;

    const now = new Date();
    const stamp = toIcsDt(now) + 'Z';
    let dtStart = null, dtEnd = null;

    if (event.when) {
      const cleaned = event.when.replace(/[⏰🎫]/g, '').replace(/\s+/g, ' ').trim();
      const timeRangeMatch = cleaned.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
      const singleTimeMatch = cleaned.match(/(\d{1,2}:\d{2})/);
      const dateOnly = cleaned
        .replace(/\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/, '')
        .replace(/\d{1,2}:\d{2}/, '')
        .trim().replace(/,\s*$/, '');

      let baseDate = new Date(dateOnly);
      if (isNaN(baseDate.getTime())) baseDate = new Date(dateOnly + ' ' + new Date().getFullYear());

      if (!isNaN(baseDate.getTime())) {
        if (timeRangeMatch) {
          const [sh, sm] = timeRangeMatch[1].split(':').map(Number);
          const [eh, em] = timeRangeMatch[2].split(':').map(Number);
          const s = new Date(baseDate); s.setHours(sh, sm, 0, 0);
          const e2 = new Date(baseDate); e2.setHours(eh, em, 0, 0);
          dtStart = toIcsDt(s); dtEnd = toIcsDt(e2);
        } else if (singleTimeMatch) {
          const [h, m] = singleTimeMatch[1].split(':').map(Number);
          const s = new Date(baseDate); s.setHours(h, m, 0, 0);
          const e2 = new Date(s); e2.setHours(h + 2, m, 0, 0);
          dtStart = toIcsDt(s); dtEnd = toIcsDt(e2);
        } else {
          // All-day
          const y = baseDate.getFullYear(), m = pad(baseDate.getMonth()+1), d = pad(baseDate.getDate());
          const e2 = new Date(baseDate); e2.setDate(e2.getDate() + 1);
          const lines = [
            `DTSTART;VALUE=DATE:${y}${m}${d}`,
            `DTEND;VALUE=DATE:${e2.getFullYear()}${pad(e2.getMonth()+1)}${pad(e2.getDate())}`,
          ];
          return this._buildIcs(event, lines, stamp);
        }
      }
    }

    if (!dtStart) {
      const s = new Date(now); s.setDate(s.getDate() + 7); s.setHours(10, 0, 0, 0);
      const e2 = new Date(s); e2.setHours(12, 0, 0, 0);
      dtStart = toIcsDt(s); dtEnd = toIcsDt(e2);
    }
    return this._buildIcs(event, [`DTSTART:${dtStart}`, `DTEND:${dtEnd}`], stamp);
  },

  _buildIcs(event, dtLines, stamp) {
    const esc = (s) => (s || '').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
    const uid = `${event.id}-${Date.now()}@cyberspace-dashboard`;
    const description = [
      event.why,
      event.url ? `Event page: ${event.url}` : '',
      event.cost ? `Cost: ${event.cost}` : '',
      event.relevance ? `Relevance: ${event.relevance}` : '',
    ].filter(Boolean).join('\\n');

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
  },};