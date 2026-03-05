/**
 * Briefing panel — renders daily briefing markdown with collapsible sections,
 * interactive checkboxes, date navigation, and in-content search.
 */
const Briefing = {
  dates: [],
  currentIndex: 0,
  checkboxStates: {},
  markersData: [],

  // Search state
  searchMatches: [],
  searchIndex: -1,

  // Cross-report search state
  crossSearchActive: false,
  crossSearchTimer: null,
  _profilerTimer: null,

  async init() {
    this.bindEvents();
    await this.loadDates();
    if (this.dates.length > 0) {
      // Honour URL hash — e.g. #date=2026-03-01
      const hashDate = this._getHashDate();
      const hashIdx = hashDate ? this.dates.indexOf(hashDate) : -1;
      if (hashIdx !== -1) {
        this.currentIndex = hashIdx;
        await this.loadBriefing(hashDate);
      } else {
        await this.loadBriefing(this.dates[0]);
      }
      this.updateNav();
    } else {
      document.getElementById('briefing-content').innerHTML =
        '<div class="empty-state">No briefings yet.<br>Run the intelligence system to generate your first report.</div>';
      document.getElementById('briefing-date').textContent = 'No reports';
    }
  },

  bindEvents() {
    document.getElementById('briefing-prev').addEventListener('click', () => this.navigate(1));
    document.getElementById('briefing-next').addEventListener('click', () => this.navigate(-1));
    document.getElementById('briefing-today').addEventListener('click', () => this.goToToday());

    // Hash navigation — browser back/forward
    window.addEventListener('hashchange', async () => {
      if (this._isLoading) return;
      const date = this._getHashDate();
      if (date && date !== this.dates[this.currentIndex]) {
        const idx = this.dates.indexOf(date);
        if (idx !== -1) {
          this.currentIndex = idx;
          this._isLoading = true;
          await this.loadBriefing(date);
          this._isLoading = false;
          this.updateNav();
          App.setActiveDate(date);
        }
      }
    });

    // Search events
    const searchInput = document.getElementById('briefing-search-input');
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => this.performSearch(searchInput.value), 200);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.navigateMatch(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { e.preventDefault(); this.toggleSearch(false); }
    });
    document.getElementById('briefing-search-prev').addEventListener('click', () => this.navigateMatch(-1));
    document.getElementById('briefing-search-next').addEventListener('click', () => this.navigateMatch(1));
    document.getElementById('briefing-search-close').addEventListener('click', () => this.toggleSearch(false));

    const crossBtn = document.getElementById('briefing-search-cross-btn');
    if (crossBtn) crossBtn.addEventListener('click', () => this.toggleCrossSearch());
  },

  toggleSearch(forceVisible) {
    const bar = document.getElementById('briefing-search-bar');
    const input = document.getElementById('briefing-search-input');
    if (forceVisible === false) {
      if (bar) bar.classList.add('hidden');
      if (input) input.value = '';
      this.clearSearch();
      if (this.crossSearchActive) {
        this.crossSearchActive = false;
        const crossBtn = document.getElementById('briefing-search-cross-btn');
        if (crossBtn) crossBtn.classList.remove('active');
        this.loadBriefing(this.dates[this.currentIndex]);
      }
    } else {
      if (bar) bar.classList.remove('hidden');
      if (input) input.focus();
    }
  },

  toggleCrossSearch() {
    this.crossSearchActive = !this.crossSearchActive;
    const crossBtn = document.getElementById('briefing-search-cross-btn');
    if (crossBtn) crossBtn.classList.toggle('active', this.crossSearchActive);

    if (!this.crossSearchActive) {
      // Deactivating — reload current briefing and clear cross results
      this.loadBriefing(this.dates[this.currentIndex]);
      document.getElementById('briefing-search-count').textContent = '';
    } else {
      // Activating — run search with current query if any
      const query = document.getElementById('briefing-search-input').value.trim();
      if (query.length >= 2) this.performCrossSearch(query);
    }
  },

  performSearch(query) {
    // If cross-search mode is active, delegate
    if (this.crossSearchActive) {
      this.performCrossSearch(query);
      return;
    }
    this.clearSearchHighlights();
    this.searchMatches = [];
    this.searchIndex = -1;

    if (!query || query.length < 2) {
      document.getElementById('briefing-search-count').textContent = '';
      return;
    }

    const container = document.querySelector('#briefing-content .markdown-body');
    if (!container) return;

    // Walk text nodes and wrap matches
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const matchNodes = [];
    const lowerQuery = query.toLowerCase();

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent.toLowerCase().includes(lowerQuery)) {
        matchNodes.push(node);
      }
    }

    for (const node of matchNodes) {
      const text = node.textContent;
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      if (parts.length <= 1) continue;

      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (regex.test(part) || part.toLowerCase() === lowerQuery) {
          const mark = document.createElement('mark');
          mark.className = 'briefing-highlight';
          mark.textContent = part;
          frag.appendChild(mark);
          this.searchMatches.push(mark);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
        regex.lastIndex = 0;
      }
      node.parentNode.replaceChild(frag, node);
    }

    // Auto-expand collapsed sections containing matches
    for (const mark of this.searchMatches) {
      const section = mark.closest('.briefing-section');
      if (section && !section.classList.contains('expanded')) {
        section.classList.add('expanded');
        const h2 = section.previousElementSibling;
        if (h2?.tagName === 'H2') h2.classList.add('expanded');
      }
    }

    const count = this.searchMatches.length;
    document.getElementById('briefing-search-count').textContent = count > 0 ? `${count} found` : 'no results';

    if (count > 0) this.navigateMatch(1);
  },

  performCrossSearch(query) {
    clearTimeout(this.crossSearchTimer);
    if (!query || query.length < 2) {
      document.getElementById('briefing-search-count').textContent = '';
      return;
    }
    this.crossSearchTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('Search failed');
        const results = await res.json();
        this.renderCrossResults(results, query);
      } catch (err) {
        console.error('[briefing] Cross-search error:', err);
      }
    }, 300);
  },

  renderCrossResults(results, query) {
    const container = document.getElementById('briefing-content');
    const totalDates = this.dates.length;

    if (results.length === 0) {
      container.innerHTML = `<div class="empty-state">No matches found across ${totalDates} report${totalDates !== 1 ? 's' : ''}.</div>`;
      document.getElementById('briefing-search-count').textContent = '0 found';
      return;
    }

    document.getElementById('briefing-search-count').textContent = `${results.length} found`;

    // Group by date
    const byDate = new Map();
    for (const r of results) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    }

    const lq = query.toLowerCase();
    const escHtml = (s) => {
      const d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    };
    const highlight = (text) => {
      const esc = escHtml(text);
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return esc.replace(regex, '<mark>$1</mark>');
    };

    let html = '';
    for (const [date, items] of byDate) {
      html += `<div class="cross-results-date-header" data-date="${date}">${date} (${items.length} match${items.length !== 1 ? 'es' : ''})</div>`;
      for (const item of items) {
        html += `<div class="cross-result-item" data-date="${date}" data-line="${item.lineNum}">
          ${item.section ? `<div class="cross-result-section">${escHtml(item.section)}</div>` : ''}
          <div class="cross-result-context">${highlight(item.context)}</div>
        </div>`;
      }
    }

    container.innerHTML = html;

    // Bind click: load that date's briefing and highlight the query
    container.querySelectorAll('.cross-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.dataset.date;
        const dateIdx = this.dates.indexOf(date);
        if (dateIdx !== -1) this.currentIndex = dateIdx;
        this.updateNav();

        // Exit cross-search mode, load briefing, then search locally
        this.crossSearchActive = false;
        const crossBtn = document.getElementById('briefing-search-cross-btn');
        if (crossBtn) crossBtn.classList.remove('active');

        this.loadBriefing(date).then(() => {
          const q = document.getElementById('briefing-search-input').value.trim();
          if (q.length >= 2) this.performSearch(q);
        });
      });
    });
  },

  navigateMatch(direction) {
    if (this.searchMatches.length === 0) return;

    // Remove active from current
    if (this.searchIndex >= 0 && this.searchIndex < this.searchMatches.length) {
      this.searchMatches[this.searchIndex].classList.remove('briefing-highlight-active');
    }

    this.searchIndex += direction;
    if (this.searchIndex >= this.searchMatches.length) this.searchIndex = 0;
    if (this.searchIndex < 0) this.searchIndex = this.searchMatches.length - 1;

    const current = this.searchMatches[this.searchIndex];
    current.classList.add('briefing-highlight-active');
    current.scrollIntoView({ behavior: 'smooth', block: 'center' });

    document.getElementById('briefing-search-count').textContent =
      `${this.searchIndex + 1}/${this.searchMatches.length}`;
  },

  clearSearch() {
    this.clearSearchHighlights();
    this.searchMatches = [];
    this.searchIndex = -1;
    document.getElementById('briefing-search-input').value = '';
    document.getElementById('briefing-search-count').textContent = '';
  },

  clearSearchHighlights() {
    const container = document.querySelector('#briefing-content .markdown-body');
    if (!container) return;
    const marks = container.querySelectorAll('mark.briefing-highlight');
    marks.forEach(mark => {
      const text = document.createTextNode(mark.textContent);
      mark.parentNode.replaceChild(text, mark);
    });
    // Merge adjacent text nodes
    container.normalize();
  },

  setMarkers(markers) {
    this.markersData = markers || [];
  },

  scrollToMarker(markerId) {
    const container = document.querySelector('#briefing-content .markdown-body');
    if (!container) return;

    const marker = this.markersData.find(m => m.id === markerId);
    if (!marker) return;

    const titleNeedle = (marker.title || '').toLowerCase();
    // Collect all story-level headings (h3, h4) and section headings (h2)
    const allHeadings = [...container.querySelectorAll('h2, h3, h4')];

    // 1) Try exact heading match on h3/h4 (individual story titles)
    for (const h of allHeadings) {
      if (h.tagName === 'H2') continue;
      const hText = h.textContent.toLowerCase();
      if (titleNeedle && hText.includes(titleNeedle.slice(0, 30))) {
        this._expandAndFlash(h);
        return;
      }
    }

    // 2) Try matching a link whose text contains the story title
    if (titleNeedle.length > 10) {
      const links = [...container.querySelectorAll('a')];
      for (const a of links) {
        if (a.textContent.toLowerCase().includes(titleNeedle.slice(0, 30))) {
          // Find the closest heading above this link
          const heading = a.closest('h3, h4') || this._closestHeadingAbove(a, container);
          if (heading) { this._expandAndFlash(heading); return; }
          // No heading — flash the link's parent block
          const block = a.closest('p, li, div');
          if (block) { this._expandAndFlash(block); return; }
        }
      }
    }

    // 3) Try matching by source_url (href)
    if (marker.source_url) {
      const a = container.querySelector(`a[href="${CSS.escape(marker.source_url)}"]`)
             || container.querySelector(`a[href*="${CSS.escape(new URL(marker.source_url).hostname)}"]`);
      if (a) {
        const heading = a.closest('h3, h4') || this._closestHeadingAbove(a, container);
        if (heading) { this._expandAndFlash(heading); return; }
      }
    }

    // 4) Full-text search in paragraphs for title keywords
    if (titleNeedle.length > 10) {
      const words = titleNeedle.split(/\s+/).filter(w => w.length > 4).slice(0, 4);
      if (words.length >= 2) {
        const paras = [...container.querySelectorAll('p, li')];
        for (const p of paras) {
          const pText = p.textContent.toLowerCase();
          const hits = words.filter(w => pText.includes(w)).length;
          if (hits >= Math.ceil(words.length * 0.6)) {
            const heading = this._closestHeadingAbove(p, container);
            if (heading) { this._expandAndFlash(heading); return; }
            this._expandAndFlash(p);
            return;
          }
        }
      }
    }

    // 5) Fall back: section heading by category
    const categoryMap = {
      'active-threats': ['active threats', 'critical'],
      'vulnerability-intel': ['vulnerability'],
      'breaches': ['breaches'],
      'threat-actors': ['threat actors'],
      'ai-security': ['ai'],
      'policy': ['policy'],
      'tools': ['tools'],
    };
    const keywords = marker.priority === 'critical'
      ? ['critical', ...(categoryMap[marker.category] || [])]
      : (categoryMap[marker.category] || []);

    for (const kw of keywords) {
      const h = allHeadings.find(h => h.textContent.toLowerCase().includes(kw));
      if (h) { this._expandAndFlash(h); return; }
    }
  },

  /** Walk backwards from an element to find the nearest heading above it. */
  _closestHeadingAbove(el, container) {
    let node = el.previousElementSibling || el.parentElement;
    let depth = 0;
    while (node && node !== container && depth < 50) {
      if (/^H[2-4]$/.test(node.tagName)) return node;
      // Check inside briefing-section wrappers
      if (node.previousElementSibling) {
        node = node.previousElementSibling;
      } else {
        node = node.parentElement;
      }
      depth++;
    }
    return null;
  },

  /** Expand the briefing section containing an element, flash it, scroll to it. */
  _expandAndFlash(el) {
    // Walk up to find and expand any collapsed briefing-section ancestor
    let section = el.closest('.briefing-section');
    if (section && !section.classList.contains('expanded')) {
      section.classList.add('expanded');
      const h2 = section.previousElementSibling;
      if (h2?.tagName === 'H2') h2.classList.add('expanded');
    }
    // Also handle if el IS a h2 section heading
    if (el.tagName === 'H2') {
      const nextSec = el.nextElementSibling;
      if (nextSec?.classList.contains('briefing-section') && !nextSec.classList.contains('expanded')) {
        nextSec.classList.add('expanded');
        el.classList.add('expanded');
      }
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-flash');
    setTimeout(() => el.classList.remove('highlight-flash'), 1500);
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
    this.renderSkeleton(container);

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

      // Show a one-time toast if this briefing processed feedback
      if (/^##\s+.*Feedback Applied/im.test(markdown)) {
        const toastKey = `feedback-toast-${date}`;
        if (!localStorage.getItem(toastKey)) {
          localStorage.setItem(toastKey, '1');
          App.toast('📝 Feedback was applied in this briefing', 'briefing');
        }
      }

      ReadTracker.markRead(`briefing-${date}`);
      App.updateUnreadCount();
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Error loading briefing: ${err.message}</div>`;
    }
  },

  renderSkeleton(container) {
    container.innerHTML = `
      <div class="briefing-skeleton">
        <div class="skeleton-line lg"></div>
        <div class="skeleton-line md"></div>
        <div class="skeleton-line md"></div>
        <div class="skeleton-line sm"></div>
        <div class="skeleton-line md"></div>
        <div class="skeleton-line sm"></div>
      </div>
    `;
  },

  renderMarkdown(container, markdown, date) {
    marked.setOptions({ breaks: true, gfm: true });
    let html = marked.parse(this.stripTodoSections(markdown));
    container.innerHTML = `<div class="markdown-body">${html}</div>`;
    this.makeCollapsible(container);
    this.bindCheckboxes(container, date);
    this.bindProfilerHover(container);

    // Open all links in new tab
    container.querySelectorAll('.markdown-body a[href]').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });

    // Typewriter effect on the main heading (h1) on first render
    const h1 = container.querySelector('.markdown-body h1');
    if (h1 && typeof VisualFX !== 'undefined') {
      VisualFX.typewriterHeading(h1);
    }

    // Glitch-hover on h2 section headings
    container.querySelectorAll('.markdown-body h2').forEach(el => {
      el.classList.add('glitch-hover');
      el.setAttribute('data-text', el.textContent);
    });

    // Click anywhere in a story block → mark corresponding marker as read
    this._bindStoryReadTracking(container);
  },

  /**
   * For each h3/h4 story heading and the content below it (until the next
   * heading), clicking anywhere marks the corresponding map marker as read.
   */
  _bindStoryReadTracking(container) {
    const md = container.querySelector('.markdown-body');
    if (!md || !this.markersData?.length) return;

    const headings = [...md.querySelectorAll('h3, h4')];
    for (const h of headings) {
      // Collect sibling elements belonging to this story (until next heading or section end)
      const storyEls = [h];
      let sib = h.nextElementSibling;
      while (sib && !/^H[2-4]$/.test(sib.tagName)) {
        storyEls.push(sib);
        sib = sib.nextElementSibling;
      }

      // Find matching marker for this heading
      const hText = h.textContent.toLowerCase();
      const marker = this._findMarkerForHeading(hText, storyEls);
      if (!marker) continue;

      // Bind click on all story elements
      for (const el of storyEls) {
        el.addEventListener('click', () => {
          if (!ReadTracker.isRead(marker.id)) {
            MapView.markMarkerRead(marker.id);
          }
        });
        el.style.cursor = 'pointer';
      }
    }
  },

  /**
   * Match a story heading to a marker using title text, link href,
   * or keyword overlap.
   */
  _findMarkerForHeading(hText, storyEls) {
    if (!this.markersData?.length) return null;

    // 1) Title text match (first 30 chars)
    for (const m of this.markersData) {
      const mTitle = (m.title || '').toLowerCase();
      if (mTitle && hText.includes(mTitle.slice(0, 30))) return m;
      if (mTitle && mTitle.includes(hText.slice(0, 30)) && hText.length > 5) return m;
    }

    // 2) Match by source_url in any link within the story block
    const links = [];
    for (const el of storyEls) {
      links.push(...el.querySelectorAll('a[href]'));
    }
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      for (const m of this.markersData) {
        if (m.source_url && href === m.source_url) return m;
      }
    }

    // 3) Keyword fuzzy match
    const allText = storyEls.map(e => e.textContent).join(' ').toLowerCase();
    let bestMarker = null, bestScore = 0;
    for (const m of this.markersData) {
      const words = (m.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
      if (words.length < 2) continue;
      const hits = words.filter(w => allText.includes(w)).length;
      const score = hits / words.length;
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMarker = m;
      }
    }
    return bestMarker;
  },

  // Source descriptions for known security/tech news domains
  _SOURCE_INFO: {
    'thehackernews.com': 'The Hacker News — leading cybersecurity news platform covering vulnerabilities, breaches, and threat intelligence.',
    'bleepingcomputer.com': 'BleepingComputer — technology and security news, malware analysis, and vulnerability advisories.',
    'krebsonsecurity.com': 'Krebs on Security — investigative cybersecurity journalism by Brian Krebs.',
    'darkreading.com': 'Dark Reading — enterprise security news, research, and analysis.',
    'therecord.media': 'The Record — cybersecurity news from Recorded Future covering APTs, policy, and intelligence.',
    'cisa.gov': 'CISA — US Cybersecurity & Infrastructure Security Agency official advisories and alerts.',
    'cert.europa.eu': 'CERT-EU — EU Computer Emergency Response Team security advisories.',
    'schneier.com': 'Schneier on Security — Bruce Schneier\'s blog on security, privacy, and cryptography.',
    'arstechnica.com': 'Ars Technica — in-depth technology journalism and security coverage.',
    'wired.com': 'WIRED — technology and security reporting, investigative journalism.',
    'securityweek.com': 'SecurityWeek — enterprise security news, ICS/SCADA, vulnerability coverage.',
    'mandiant.com': 'Mandiant (Google) — threat intelligence, APT research, and incident response.',
    'unit42.paloaltonetworks.com': 'Unit 42 — Palo Alto Networks threat intelligence and malware research.',
    'research.checkpoint.com': 'Check Point Research — vulnerability disclosures, malware analysis, and threat intelligence.',
    'blog.talosintelligence.com': 'Cisco Talos — threat intelligence, vulnerability research, and malware analysis.',
    'microsoft.com': 'Microsoft — security response center, threat intelligence, and patch advisories.',
    'google.com': 'Google — security blog, Project Zero research, Chrome security updates.',
    'trufflesecurity.com': 'Truffle Security — secrets detection and API key security research.',
    'orca.security': 'Orca Security — cloud security research and vulnerability analysis.',
    'borncity.com': 'BornCity — German-language tech blog covering Windows security and patches.',
    'malwarebytes.com': 'Malwarebytes — malware cleanup vendor, threat research and breach reporting.',
    'simonwillison.net': 'Simon Willison\'s Blog — AI/LLM tools, security implications, and developer insights.',
    'nist.gov': 'NIST — National Institute of Standards and Technology, NVD vulnerability database.',
    'nvd.nist.gov': 'NVD — NIST National Vulnerability Database, authoritative CVE/CVSS source.',
    'arctic.wolf': 'Arctic Wolf — managed detection & response, threat research.',
    'csoonline.com': 'CSO Online — security leadership news, breach analysis, risk management.',
    'infosecurity-magazine.com': 'Infosecurity Magazine — cybersecurity news, events, and expert analysis.',
    'threatpost.com': 'Threatpost — cybersecurity news, vulnerabilities, and threat landscape coverage.',
  },

  _getSourceDescription(href) {
    if (!href) return null;
    try {
      const host = new URL(href).hostname.replace(/^www\./, '');
      // Exact match first
      if (this._SOURCE_INFO[host]) return this._SOURCE_INFO[host];
      // Partial domain match (e.g. blog.talosintelligence.com)
      for (const [domain, desc] of Object.entries(this._SOURCE_INFO)) {
        if (host.includes(domain) || domain.includes(host)) return desc;
      }
      // Fallback: clean domain name
      return host.charAt(0).toUpperCase() + host.slice(1) + ' — external source';
    } catch { return null; }
  },

  bindProfilerHover(container) {
    const targets = container.querySelectorAll('.markdown-body h3, .markdown-body h4, .markdown-body a');
    targets.forEach(el => {
      el.addEventListener('mouseenter', (e) => {
        const title = (el.textContent || '').trim();
        if (!title || title.length < 4) return;

        const card = document.getElementById('profiler-card');
        const titleEl = document.getElementById('profiler-title');
        const metaEl = document.getElementById('profiler-meta');
        const summaryEl = document.getElementById('profiler-summary');
        if (!card || !titleEl || !metaEl || !summaryEl) return;

        // For links: show source description instead of raw context
        const isLink = el.tagName === 'A' && el.href;
        if (isLink) {
          const srcDesc = this._getSourceDescription(el.href);
          const host = (() => { try { return new URL(el.href).hostname.replace(/^www\./, ''); } catch { return ''; } })();
          metaEl.textContent = `SOURCE · ${host.toUpperCase()}`;
          summaryEl.textContent = srcDesc || el.href;
        } else {
          metaEl.textContent = 'BRIEFING ENTITY · SCANNED';
          const context = el.closest('p, li, div')?.textContent || '';
          summaryEl.textContent = context.slice(0, 160);
        }

        titleEl.textContent = '';
        clearTimeout(this._profilerTimer);
        let i = 0;
        const type = () => {
          titleEl.textContent = title.slice(0, i);
          i++;
          if (i <= Math.min(title.length, 56)) {
            this._profilerTimer = setTimeout(type, 14);
          }
        };
        type();

        card.classList.remove('hidden');
        card.style.left = `${Math.min(window.innerWidth - 320, Math.max(8, e.clientX + 14))}px`;
        card.style.top = `${Math.min(window.innerHeight - 140, Math.max(50, e.clientY - 10))}px`;
      });

      el.addEventListener('mousemove', (e) => {
        const card = document.getElementById('profiler-card');
        if (!card || card.classList.contains('hidden')) return;
        card.style.left = `${Math.min(window.innerWidth - card.offsetWidth - 8, Math.max(8, e.clientX + 14))}px`;
        card.style.top = `${Math.min(window.innerHeight - card.offsetHeight - 8, Math.max(50, e.clientY - 8))}px`;
      });

      el.addEventListener('mouseleave', () => {
        const card = document.getElementById('profiler-card');
        if (card) card.classList.add('hidden');
        clearTimeout(this._profilerTimer);
      });
    });
  },

  /**
   * Remove sections that are surfaced in the Tasks panel instead,
   * so they don't appear twice. Skips lines from a matching ## heading
   * until the next ## heading (which resets the skip flag).
   */
  stripTodoSections(markdown) {
    const OMIT = ['action items', 'further reading'];
    const lines = markdown.split('\n');
    const out = [];
    let skip = false;

    for (const line of lines) {
      if (/^## /i.test(line)) {
        const title = line.replace(/^##\s+/, '').replace(/[^\w\s]/g, '').trim().toLowerCase();
        skip = OMIT.some(o => title.includes(o));
      }
      if (!skip) out.push(line);
    }
    return out.join('\n');
  },

  makeCollapsible(container) {
    const headings = container.querySelectorAll('.markdown-body h2');
    headings.forEach(h2 => {
      const section = document.createElement('div');
      section.className = 'briefing-section expanded';
      const inner = document.createElement('div');
      inner.className = 'briefing-section-inner';
      section.appendChild(inner);
      h2.classList.add('expanded');

      let el = h2.nextElementSibling;
      const elements = [];
      while (el && el.tagName !== 'H2' && !(el.tagName === 'HR' && el.nextElementSibling?.tagName === 'H2')) {
        elements.push(el);
        el = el.nextElementSibling;
      }

      if (elements.length > 0) {
        h2.after(section);
        for (const e of elements) {
          inner.appendChild(e);
        }
      }

      h2.addEventListener('click', () => {
        const expanded = h2.classList.toggle('expanded');
        section.classList.toggle('expanded', expanded);
      });
    });
  },

  bindCheckboxes(container, date) {
    const key = `checkboxes-${date}`;
    this.checkboxStates = JSON.parse(localStorage.getItem(key) || '{}');

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb, i) => {
      cb.removeAttribute('disabled'); // marked renders task lists with disabled; make them interactive
      if (this.checkboxStates[i] !== undefined) {
        cb.checked = !!this.checkboxStates[i];
      }
      cb.addEventListener('change', () => {
        this.checkboxStates[i] = cb.checked;
        localStorage.setItem(key, JSON.stringify(this.checkboxStates));
      });
    });
  },

  extractThreatLevel(markdown) {
    const badge = document.getElementById('threat-badge');
    const label = document.getElementById('threat-label');

    const match = markdown.match(/(?:threat level|Overall threat level)[:\s]*([🟢🟡🟠🔴])\s*(\w+)/i)
      || markdown.match(/(🟢|🟡|🟠|🔴)\s*(LOW|GUARDED|ELEVATED|HIGH|SEVERE|CRITICAL)/i);

    if (match) {
      const emoji = match[1];
      const level = match[2].toUpperCase();
      label.textContent = level;
      label.dataset.text = level;
      label.classList.remove('glitch');

      badge.className = 'threat-badge';
      if (emoji === '🔴' || level === 'CRITICAL' || level === 'SEVERE') {
        badge.classList.add('threat-critical');
        label.classList.add('glitch');
        if (typeof MatrixRain !== 'undefined') MatrixRain.intensify();
      } else if (emoji === '🟠' || level === 'HIGH') {
        badge.classList.add('threat-high');
        label.classList.add('glitch');
      }
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

  getUnreadCount() {
    // Count unread map markers from the latest report (events have their own badge)
    if (typeof MapView === 'undefined' || !MapView.markers || MapView.markers.length === 0) return 0;
    return MapView.markers.filter(m => m.data.type !== 'event' && !ReadTracker.isRead(m.data.id)).length;
  },

  navigate(direction) {
    const newIndex = this.currentIndex + direction;
    if (newIndex < 0 || newIndex >= this.dates.length) return;
    this.currentIndex = newIndex;
    const date = this.dates[this.currentIndex];
    this.loadBriefing(date);
    this.updateNav();
    this._setHashDate(date);
    // Sync the entire dashboard to this date
    App.setActiveDate(date);
  },

  goToToday() {
    if (this.currentIndex === 0 || this.dates.length === 0) return;
    this.currentIndex = 0;
    const date = this.dates[0];
    this.loadBriefing(date);
    this.updateNav();
    this._setHashDate(date);
    App.setActiveDate(date);
  },

  updateNav() {
    document.getElementById('briefing-prev').disabled = this.currentIndex >= this.dates.length - 1;
    document.getElementById('briefing-next').disabled = this.currentIndex <= 0;
    // Show "today" button only when viewing an older report
    const todayBtn = document.getElementById('briefing-today');
    if (todayBtn) todayBtn.classList.toggle('hidden', this.currentIndex === 0);
  },

  _setHashDate(date) {
    if (history.pushState) {
      history.pushState(null, '', `#date=${date}`);
    } else {
      window.location.hash = `date=${date}`;
    }
  },

  _getHashDate() {
    const m = window.location.hash.match(/^#date=(\d{4}-\d{2}-\d{2})$/);
    return m ? m[1] : null;
  },

  async refresh() {
    await this.loadDates();
    if (this.dates.length > 0) {
      this.currentIndex = 0;
      await this.loadBriefing(this.dates[0]);
    }
  },

  /** Return the currently viewed date. */
  getCurrentDate() {
    return this.dates[this.currentIndex] || null;
  },
};
