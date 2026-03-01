/**
 * Events panel — renders events from events.md as a compact list.
 * Hover/click expands inline detail card with full info + accept/skip.
 */
const Events = {
  events: [],
  expandedId: null,

  async init() {
    await this.load();
  },

  async load() {
    const container = document.getElementById('events-list');
    try {
      // Get latest report date
      const res = await fetch('/api/reports/latest');
      if (!res.ok) {
        container.innerHTML = '<div class="empty-state">No event reports available yet.</div>';
        return;
      }
      const { date } = await res.json();

      // Load events.md
      const evRes = await fetch(`/api/file?path=reports/${date}/events.md`);
      if (!evRes.ok) {
        container.innerHTML = '<div class="empty-state">No event radar for the latest report.</div>';
        return;
      }
      const markdown = await evRes.text();
      this.events = this.parseEvents(markdown);

      if (this.events.length === 0) {
        container.innerHTML = '<div class="empty-state">No events found in the latest radar.</div>';
        return;
      }

      this.render();
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Error loading events: ${err.message}</div>`;
    }
  },

  /**
   * Parse events.md into structured event objects.
   * Looks for ### headers with event names and **field:** patterns.
   */
  parseEvents(markdown) {
    const events = [];
    const sections = markdown.split(/^### /m).slice(1); // Split on h3

    for (const section of sections) {
      const lines = section.trim().split('\n');
      const firstLine = lines[0] || '';

      // Extract name and link from: [Event Name](url) or plain text
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

      // Extract numeric score from relevance
      const scoreMatch = (event.relevance || '').match(/(\d+)\/10/);
      if (scoreMatch) event.score = parseInt(scoreMatch[1]);

      // Extract stars
      const starCount = (event.relevance || '').split('★').length - 1;
      event.stars = starCount || Math.round(event.score / 2);

      events.push(event);
    }

    return events;
  },

  extractField(text, fieldName) {
    const regex = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?:\\n|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  },

  render() {
    const container = document.getElementById('events-list');
    let html = '';

    for (const event of this.events) {
      const starsStr = '★'.repeat(Math.min(event.stars, 5)) + '☆'.repeat(Math.max(0, 5 - event.stars));
      const isExpanded = this.expandedId === event.id;
      const isAccepted = localStorage.getItem(`event-accepted-${event.id}`);
      const isSkipped = localStorage.getItem(`event-skipped-${event.id}`);
      let stateClass = '';
      if (isAccepted) stateClass = 'event-accepted';
      if (isSkipped) stateClass = 'event-skipped';

      html += `
        <div class="event-item ${stateClass}" data-id="${event.id}">
          <div class="event-item-body">
            <div class="event-item-name">${this.escapeHtml(event.name)}</div>
            <div class="event-item-meta">${this.escapeHtml(event.when || 'Date TBD')} · ${this.escapeHtml(event.where || 'Location TBD')}</div>
          </div>
          <div class="event-stars">${starsStr}</div>
          <div class="event-arrow">›</div>
        </div>
        <div class="event-detail ${isExpanded ? 'active' : ''}" id="detail-${event.id}">
          ${this.renderDetail(event, isAccepted, isSkipped)}
        </div>
      `;
    }

    container.innerHTML = html;

    // Bind click handlers for expansion
    container.querySelectorAll('.event-item').forEach(el => {
      el.addEventListener('click', () => this.toggleDetail(el.dataset.id));
    });

    // Bind accept/skip buttons
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
    if (event.cost) html += `<div class="event-detail-field"><span class="event-detail-label">Cost: </span><span class="event-detail-value">${this.escapeHtml(event.cost)}</span></div>`;
    if (event.relevance) html += `<div class="event-detail-field"><span class="event-detail-label">Relevance: </span><span class="event-detail-value">${this.escapeHtml(event.relevance)}</span></div>`;
    if (event.calendar) html += `<div class="event-detail-field"><span class="event-detail-label">Calendar: </span><span class="event-detail-value">${this.escapeHtml(event.calendar)}</span></div>`;
    if (event.deadline) html += `<div class="event-detail-field"><span class="event-detail-label">Deadline: </span><span class="event-detail-value">${this.escapeHtml(event.deadline)}</span></div>`;
    if (event.why) html += `<div class="event-detail-why">${this.escapeHtml(event.why)}</div>`;
    if (event.url) html += `<div class="event-detail-field"><a href="${this.escapeHtml(event.url)}" target="_blank" style="color:var(--event-color)">Event page ↗</a></div>`;

    if (!isAccepted && !isSkipped) {
      html += `
        <div class="event-actions">
          <button class="event-btn-accept" data-id="${event.id}">✅ Accept</button>
          <button class="event-btn-skip" data-id="${event.id}">❌ Skip</button>
        </div>
      `;
    } else if (isAccepted) {
      html += `<div style="margin-top:8px;color:var(--accent);font-size:11px;">✅ Accepted</div>`;
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
    // Toggle all detail panels
    document.querySelectorAll('.event-detail').forEach(el => {
      el.classList.toggle('active', el.id === `detail-${this.expandedId}`);
    });
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
      this.render();
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
    } catch (err) {
      console.error('[events] Skip error:', err);
    }
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
};
