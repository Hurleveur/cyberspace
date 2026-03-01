/**
 * Briefing panel — renders daily briefing markdown with collapsible sections,
 * interactive checkboxes, and date navigation.
 */
const Briefing = {
  dates: [],
  currentIndex: 0,
  checkboxStates: {},

  async init() {
    this.bindEvents();
    await this.loadDates();
    if (this.dates.length > 0) {
      await this.loadBriefing(this.dates[0]);
    } else {
      document.getElementById('briefing-content').innerHTML =
        '<div class="empty-state">No briefings yet.<br>Run the intelligence system to generate your first report.</div>';
      document.getElementById('briefing-date').textContent = 'No reports';
    }
  },

  bindEvents() {
    document.getElementById('briefing-prev').addEventListener('click', () => this.navigate(1));
    document.getElementById('briefing-next').addEventListener('click', () => this.navigate(-1));
  },

  async loadDates() {
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) return;
      const data = await res.json();
      this.dates = data.dates || [];
    } catch {
      this.dates = [];
    }
    this.updateNav();
  },

  async loadBriefing(date) {
    const container = document.getElementById('briefing-content');
    document.getElementById('briefing-date').textContent = date;

    try {
      const res = await fetch(`/api/file?path=reports/${date}/briefing.md`);
      if (!res.ok) {
        container.innerHTML = `<div class="empty-state">No briefing for ${date}</div>`;
        return;
      }
      const markdown = await res.text();
      this.renderMarkdown(container, markdown, date);
      this.extractThreatLevel(markdown);
      this.extractStreak(markdown);

      // Mark briefing as read
      ReadTracker.markRead(`briefing-${date}`);
      App.updateUnreadCount();
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Error loading briefing: ${err.message}</div>`;
    }
  },

  renderMarkdown(container, markdown, date) {
    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    let html = marked.parse(markdown);

    // Wrap in markdown-body for styling
    container.innerHTML = `<div class="markdown-body">${html}</div>`;

    // Make h2 sections collapsible
    this.makeCollapsible(container);

    // Make checkboxes interactive
    this.bindCheckboxes(container, date);
  },

  makeCollapsible(container) {
    const headings = container.querySelectorAll('.markdown-body h2');
    headings.forEach(h2 => {
      // Collect all siblings until next h2 or hr
      const section = document.createElement('div');
      section.className = 'briefing-section expanded';
      h2.classList.add('expanded');

      let el = h2.nextElementSibling;
      const elements = [];
      while (el && el.tagName !== 'H2' && !(el.tagName === 'HR' && el.nextElementSibling?.tagName === 'H2')) {
        elements.push(el);
        el = el.nextElementSibling;
      }

      // Move elements into section div
      if (elements.length > 0) {
        h2.after(section);
        for (const e of elements) {
          section.appendChild(e);
        }
      }

      h2.addEventListener('click', () => {
        const expanded = h2.classList.toggle('expanded');
        section.classList.toggle('expanded', expanded);
      });
    });
  },

  bindCheckboxes(container, date) {
    // Load saved state
    const key = `checkboxes-${date}`;
    this.checkboxStates = JSON.parse(localStorage.getItem(key) || '{}');

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb, i) => {
      if (this.checkboxStates[i]) cb.checked = true;
      cb.addEventListener('change', () => {
        this.checkboxStates[i] = cb.checked;
        localStorage.setItem(key, JSON.stringify(this.checkboxStates));
      });
    });
  },

  extractThreatLevel(markdown) {
    const badge = document.getElementById('threat-badge');
    const label = document.getElementById('threat-label');

    // Look for threat level patterns
    const match = markdown.match(/(?:threat level|Overall threat level)[:\s]*([🟢🟡🟠🔴])\s*(\w+)/i)
      || markdown.match(/(🟢|🟡|🟠|🔴)\s*(LOW|GUARDED|ELEVATED|HIGH|SEVERE|CRITICAL)/i);

    if (match) {
      const emoji = match[1];
      const level = match[2].toUpperCase();
      label.textContent = level;

      badge.className = 'threat-badge';
      if (emoji === '🔴' || level === 'CRITICAL' || level === 'SEVERE') badge.classList.add('threat-critical');
      else if (emoji === '🟠' || level === 'HIGH') badge.classList.add('threat-high');
      else if (emoji === '🟡' || level === 'ELEVATED' || level === 'MEDIUM') badge.classList.add('threat-medium');
      else badge.classList.add('threat-low');
    }
  },

  extractStreak(markdown) {
    const match = markdown.match(/Briefing #(\d+)/);
    if (match) {
      document.getElementById('streak-badge').textContent = `Briefing #${match[1]}`;
    }
  },

  navigate(direction) {
    const newIndex = this.currentIndex + direction;
    if (newIndex < 0 || newIndex >= this.dates.length) return;
    this.currentIndex = newIndex;
    this.loadBriefing(this.dates[this.currentIndex]);
    this.updateNav();
  },

  updateNav() {
    document.getElementById('briefing-prev').disabled = this.currentIndex >= this.dates.length - 1;
    document.getElementById('briefing-next').disabled = this.currentIndex <= 0;
  },

  async refresh() {
    await this.loadDates();
    if (this.dates.length > 0) {
      this.currentIndex = 0;
      await this.loadBriefing(this.dates[0]);
    }
  },
};
