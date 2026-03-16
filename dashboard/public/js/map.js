/**
 * World map — Leaflet with CartoDB Dark Matter tiles.
 * Loads markers from markers.json via the file API.
 * Items with a location_label but no lat/lng are geocoded via Nominatim
 * (OpenStreetMap) and the results are cached in localStorage.
 */
const MapView = {
  map: null,
  markers: [],
  markerLayer: null,
  linkLayer: null,
  geoCache: {},
  linksEnabled: true,
  _profilerTimer: null,

  GEO_CACHE_KEY: 'cyberspace-geocache',
  LINKS_KEY: 'cyberspace-marker-links',

  async init() {
    const defaultCenter = [20, 0];
    let mapCenter = defaultCenter;
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const cfg = await res.json();
        const center = cfg && Array.isArray(cfg.mapCenter) ? cfg.mapCenter : null;
        if (
          center &&
          center.length === 2 &&
          Number.isFinite(center[0]) &&
          Number.isFinite(center[1])
        ) {
          mapCenter = center;
        }
      }
    } catch {
      mapCenter = defaultCenter;
    }

    this.map = L.map('map', {
      center: mapCenter,
      zoom: 4,
      minZoom: 3,
      maxZoom: 14,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
      zoomControl: false,
      attributionControl: true,
    });

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 14,
    }).addTo(this.map);

    // Marker layer group
    this.markerLayer = L.layerGroup().addTo(this.map);
    this.linkLayer = L.layerGroup().addTo(this.map);

    const savedLinks = localStorage.getItem(this.LINKS_KEY);
    this.linksEnabled = savedLinks !== 'off';

    // Re-spread co-located markers when zoom changes
    this.map.on('zoomend', () => this._respreadOnZoom());

    // Load geocoding cache from localStorage
    this.loadGeoCache();

    // Load markers for latest report
    this.loadLatestMarkers();
  },

  // ── Geocoding cache ──────────────────────────────────────────────────────────

  loadGeoCache() {
    try {
      this.geoCache = JSON.parse(localStorage.getItem(this.GEO_CACHE_KEY) || '{}');
    } catch {
      this.geoCache = {};
    }
  },

  saveGeoCache() {
    try {
      localStorage.setItem(this.GEO_CACHE_KEY, JSON.stringify(this.geoCache));
    } catch {}
  },

  /**
   * Resolve a location label to {lat, lng} via Nominatim.
   * Results (including null for "not found") are cached in localStorage
   * so subsequent loads are instant and the API is not hammered.
   */
  async geocodeLabel(label) {
    if (!label || /^global$/i.test(label.trim())) return null;

    // Cache hit — may be null if previously failed
    if (Object.prototype.hasOwnProperty.call(this.geoCache, label)) {
      return this.geoCache[label];
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(label)}&format=json&limit=1`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'CyberspaceIntelDashboard/1.0' },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        this.geoCache[label] = coords;
        this.saveGeoCache();
        return coords;
      }
    } catch (err) {
      console.warn('[map] Nominatim error for', label, err.message);
    }

    // Cache negative result so we don't retry on every load
    this.geoCache[label] = null;
    this.saveGeoCache();
    return null;
  },

  // ── Marker loading ───────────────────────────────────────────────────────────

  async loadLatestMarkers() {
    try {
      const res = await fetch('/api/reports/latest');
      if (res.ok) {
        const { date } = await res.json();
        await this.loadMarkersForDate(date);
        return;
      }
    } catch (err) {
      console.warn('[map] No markers available:', err.message);
    }
    // Fall back to example markers
    try {
      const exRes = await fetch('/api/file?path=reports/example/markers.json');
      if (exRes.ok) {
        const data = JSON.parse(await exRes.text());
        this.plotMarkers(data);
      }
    } catch (err) {
      console.warn('[map] Could not load example markers:', err.message);
    }
  },

  async loadMarkersForDate(date) {
    try {
      // Skip fetch if the manifest says markers.json doesn't exist for this date
      if (typeof App !== 'undefined' && App.filesByDate &&
          App.filesByDate[date] && App.filesByDate[date]['markers.json'] === false) return;
      const res = await fetch(`/api/file?path=reports/${date}/markers.json`);
      if (!res.ok) return;
      const text = await res.text();
      const data = JSON.parse(text);
      this.plotMarkers(data);
    } catch (err) {
      console.warn('[map] Could not load markers.json:', err.message);
    }
  },

  /**
   * Load news markers for the active date AND event markers from all
   * events.md report dates. Merges and deduplicates by id so all event pins
   * accumulate on the map regardless of which briefing day is shown.
   *
   * @param {string}          newsDate    - the currently viewed briefing date
   * @param {string|string[]} eventsDates - one date or array of all event-radar dates
   */
  async loadMarkersForDateWithEvents(newsDate, eventsDates) {
    let newsMarkers = [];

    // Load news-date markers
    if (newsDate) {
      // Skip if manifest confirms markers.json doesn't exist for this date
      const hasMarkers = !( typeof App !== 'undefined' && App.filesByDate &&
        App.filesByDate[newsDate] && App.filesByDate[newsDate]['markers.json'] === false);
      if (hasMarkers) {
        try {
          const res = await fetch(`/api/file?path=reports/${newsDate}/markers.json`);
          if (res.ok) {
            newsMarkers = JSON.parse(await res.text());
          }
        } catch (err) {
          console.warn('[map] Could not load markers.json for', newsDate, err.message);
        }
      }
    }

    // Normalise to array (backward compat with single-string callers)
    const datesArr = Array.isArray(eventsDates)
      ? eventsDates
      : (eventsDates ? [eventsDates] : []);

    // Collect event markers from every events-radar date, deduplicating by id
    const seen = new Set(newsMarkers.map(m => m.id));
    const merged = [...newsMarkers];

    for (const evDate of datesArr) {
      if (!evDate || evDate === newsDate) continue; // news markers already loaded above
      // Skip if manifest confirms markers.json doesn't exist for this date
      if (typeof App !== 'undefined' && App.filesByDate &&
          App.filesByDate[evDate] && App.filesByDate[evDate]['markers.json'] === false) continue;
      try {
        const res = await fetch(`/api/file?path=reports/${evDate}/markers.json`);
        if (res.ok) {
          const all = JSON.parse(await res.text());
          for (const em of all.filter(m => m.type === 'event')) {
            if (!seen.has(em.id)) {
              merged.push(em);
              seen.add(em.id);
            }
          }
        }
      } catch (err) {
        console.warn('[map] Could not load event markers for', evDate, err.message);
      }
    }

    // Also pull event-type markers from the news date's own markers.json
    // (they were already included in newsMarkers above, nothing extra needed)

    // Filter out events the user has already accepted or skipped
    const filtered = merged.filter(m => {
      if (m.type !== 'event') return true;
      return !localStorage.getItem(`event-accepted-${m.id}`) &&
             !localStorage.getItem(`event-skipped-${m.id}`);
    });

    this.plotMarkers(filtered);
  },

  plotMarkers(data) {
    this.markerLayer.clearLayers();
    this.linkLayer.clearLayers();
    this.markers = [];
    this._markerIndex = 0; // For drop-in animation stagger

    // Separate items into ready (have coords) and needs-geocoding
    const ready = [];
    const needsGeocoding = [];

    for (const item of data) {
      if (item.lat != null && item.lng != null) {
        ready.push(item);
      } else if (item.location_label && !/^global$/i.test(item.location_label.trim())) {
        const cached = this.geoCache[item.location_label];
        if (cached) {
          ready.push({ ...item, lat: cached.lat, lng: cached.lng });
        } else if (cached === undefined) {
          needsGeocoding.push(item);
        }
      }
    }

    // Spread co-located NEWS markers apart (events stay pinned)
    this._spreadColocated(ready);

    for (const item of ready) {
      this.addMarker(item);
    }

    // Geocode queued items sequentially (Nominatim max 1 req/sec)
    if (needsGeocoding.length > 0) {
      this.geocodePending(needsGeocoding);
    }

    this.renderConnections();
  },

  /**
   * Compute spread radius in degrees based on the current map zoom
   * and the number of items in the group.
   * At zoom 4 with 2 items: 1.5°; grows with √(count) for larger groups.
   */
  _spreadRadius(count = 2) {
    const BASE_ZOOM = 4;
    const BASE_RADIUS = 1.5;
    const zoom = this.map ? this.map.getZoom() : BASE_ZOOM;
    // Scale up for larger groups so items don't crowd the circle
    const groupScale = Math.sqrt(count / 2);
    return BASE_RADIUS * groupScale * Math.pow(2, BASE_ZOOM - zoom);
  },

  /**
   * Offset news markers that share the same lat/lng so they fan out
   * in a small circle instead of stacking. Events are never moved.
   * Stores original positions (_origLat, _origLng) for re-spreading on zoom.
   * Mutates the items in-place.
   */
  _spreadColocated(items) {
    // Group items by rounded coordinate key (5-decimal precision ≈ 1 m)
    const groups = {};
    for (const item of items) {
      const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`;
      (groups[key] ||= []).push(item);
    }

    for (const key in groups) {
      const group = groups[key];
      // Only spread news items; collect the news subset
      const news = group.filter(m => m.type !== 'event');
      if (news.length < 2) continue;

      const cx = news[0].lat;
      const cy = news[0].lng;
      const n = news.length;
      const RADIUS = this._spreadRadius(n);

      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        news[i]._origLat = cx;
        news[i]._origLng = cy;
        news[i]._origKey = key;
        news[i]._spreadIdx = i;
        news[i]._spreadTotal = n;
        news[i].lat = cx + RADIUS * Math.sin(angle);
        news[i].lng = cy + RADIUS * Math.cos(angle);
      }
    }
  },

  /**
   * Re-position all spread markers when the zoom level changes.
   * Uses stored _origLat/_origLng and recalculates offsets with updated radius.
   */
  _respreadOnZoom() {
    for (const { marker, data } of this.markers) {
      if (data._origLat == null || data.type === 'event') continue;
      const RADIUS = this._spreadRadius(data._spreadTotal);
      const angle = (2 * Math.PI * data._spreadIdx) / data._spreadTotal - Math.PI / 2;
      const newLat = data._origLat + RADIUS * Math.sin(angle);
      const newLng = data._origLng + RADIUS * Math.cos(angle);
      data.lat = newLat;
      data.lng = newLng;
      marker.setLatLng([newLat, newLng]);
    }
  },

  /**
   * Geocode items one at a time, respecting Nominatim's 1 req/sec limit.
   * Each resolved item is added to the map as soon as its coords arrive.
   */
  async geocodePending(items) {
    for (const item of items) {
      const coords = await this.geocodeLabel(item.location_label);
      if (coords) {
        const resolved = { ...item, lat: coords.lat, lng: coords.lng };
        // Offset if co-located with existing news markers
        if (resolved.type !== 'event') this._offsetIfColocated(resolved);
        this.addMarker(resolved);
        this.renderConnections();
      }
      // Wait ≥1 second between requests as required by Nominatim ToS
      await new Promise(r => setTimeout(r, 1100));
    }
  },

  /**
   * Nudge a single news marker if it overlaps with already-placed markers.
   * Picks the next open slot on a circle around the collision point.
   */
  _offsetIfColocated(item) {
    const precision = 5;
    const key = `${item.lat.toFixed(precision)},${item.lng.toFixed(precision)}`;
    // Count how many existing news markers share (roughly) this position
    let siblings = 0;
    for (const m of this.markers) {
      if (m.data.type === 'event') continue;
      const mk = `${m.data.lat.toFixed(precision)},${m.data.lng.toFixed(precision)}`;
      // Also check against the original position stored before offset
      const ok = m.data._origKey || mk;
      if (ok === key || mk === key) siblings++;
    }
    if (siblings === 0) return; // no collision
    const total = siblings + 1;
    item._origLat = item.lat;
    item._origLng = item.lng;
    item._origKey = key;
    item._spreadIdx = siblings;
    item._spreadTotal = total;
    const RADIUS = this._spreadRadius(total);
    const angle = (2 * Math.PI * siblings) / total - Math.PI / 2;
    item.lat += RADIUS * Math.sin(angle);
    item.lng += RADIUS * Math.cos(angle);
  },

  // ── Marker creation ──────────────────────────────────────────────────────────

  addMarker(item) {
    const color = this.getColor(item);
    const radius = item.priority === 'critical' ? 8 : item.priority === 'high' ? 7 : 6;
    const isRead = ReadTracker.isRead(item.id);
    const isCritical = item.priority === 'critical';

    // Build className with drop-in animation
    const idx = (this._markerIndex || 0) % 10;
    this._markerIndex = (this._markerIndex || 0) + 1;
    let className = 'marker-dropin';
    if (idx > 0 && idx <= 9) className += ` marker-delay-${idx}`;
    if (!isRead) className += isCritical ? ' marker-unread marker-critical' : ' marker-unread';

    const marker = L.circleMarker([item.lat, item.lng], {
      radius,
      fillColor: color,
      color: color,
      weight: isRead ? 1 : 2,
      opacity: isRead ? 0.3 : 0.9,
      fillOpacity: isRead ? 0.15 : 0.5,
      className,
    });

    marker.data = item;

    marker.on('click', () => {
      ReadTracker.markRead(item.id);
      marker.setStyle({ opacity: 0.3, fillOpacity: 0.15, weight: 1 });
      App.updateUnreadCount();
      if (typeof Briefing !== 'undefined') Briefing.refreshStoryIndicators();
      App.showInPanel(item.id, item.type || 'news');
    });

    marker.on('mouseover', (e) => {
      if (typeof VisualFX !== 'undefined') VisualFX.resetProfilerProgress();
      this.showProfiler(item, e.latlng);
    });
    marker.on('mousemove', (e) => this.moveProfiler(e.latlng));
    marker.on('mouseout', () => this.hideProfiler());

    this.markerLayer.addLayer(marker);
    this.markers.push({ marker, data: item });
  },

  // ── Profiler hover card ───────────────────────────────────────────────────

  /** Mark a marker as read by its data ID and dim it on the map. */
  markMarkerRead(id) {
    const entry = this.markers.find(m => m.data.id === id);
    if (!entry) return;
    ReadTracker.markRead(id);
    entry.marker.setStyle({ opacity: 0.3, fillOpacity: 0.15, weight: 1 });
    // Remove pulsing CSS classes
    const el = entry.marker.getElement?.();
    if (el) {
      el.classList.remove('marker-unread', 'marker-critical');
    }
    App.updateUnreadCount();
    if (typeof Briefing !== 'undefined') Briefing.refreshStoryIndicators();
  },

  /** Pan and zoom the map to a marker, then briefly flash it. */
  flyToMarker(id) {
    const entry = this.markers.find(m => m.data.id === id);
    if (!entry || !this.map) return;
    const { lat, lng } = entry.data;
    if (lat == null || lng == null) return;
    this.map.flyTo([lat, lng], Math.max(this.map.getZoom(), 5), { animate: true, duration: 0.7 });
    const el = entry.marker.getElement?.();
    if (el) {
      el.classList.add('marker-flash');
      setTimeout(() => el.classList.remove('marker-flash'), 1800);
    }
  },

  /** Remove a marker from the map by its data ID. */
  removeMarker(id) {
    const idx = this.markers.findIndex(m => m.data.id === id);
    if (idx === -1) return;
    this.markerLayer.removeLayer(this.markers[idx].marker);
    this.markers.splice(idx, 1);
    this.renderConnections();
  },

  showProfiler(item, latlng) {
    const card = document.getElementById('profiler-card');
    if (!card || !this.map) return;

    // Build rich meta line
    const parts = [item.type || 'news', item.priority || 'medium', item.location_label || 'Global'];

    if (item.type === 'event') {
      const ev = this.getEventDetails(item.id);
      if (ev) {
        if (ev.when) parts.push(ev.when.slice(0, 30));
        if (ev.cost) parts.push(ev.cost);
        if (ev.score) parts.push(`${ev.score}/10`);
      } else {
        if (item.date) parts.push(item.date);
      }
    } else {
      if (item.category) parts.push(item.category.replace(/-/g, ' '));
    }

    const meta = parts.map(v => String(v).toUpperCase()).join(' · ');
    document.getElementById('profiler-meta').textContent = meta;

    // Summary — for events show "why this matters" if available
    let summary = item.summary || '';
    if (item.type === 'event') {
      const ev = this.getEventDetails(item.id);
      if (ev && ev.why) summary = ev.why;
    }
    document.getElementById('profiler-summary').textContent = summary;

    const titleEl = document.getElementById('profiler-title');
    const title = item.title || 'Untitled';
    titleEl.textContent = '';
    if (this._profilerTimer) cancelAnimationFrame(this._profilerTimer);

    let idx = 0;
    const maxLen = Math.min(title.length, 48);
    const type = () => {
      titleEl.textContent = title.slice(0, idx);
      idx++;
      if (idx <= maxLen) {
        this._profilerTimer = requestAnimationFrame(type);
      }
    };
    type();

    card.classList.remove('hidden');
    // Set CSS var for scanline travel distance
    requestAnimationFrame(() => card.style.setProperty('--profiler-h', card.offsetHeight + 'px'));
    this.moveProfiler(latlng);
  },

  moveProfiler(latlng) {
    const card = document.getElementById('profiler-card');
    if (!card || card.classList.contains('hidden') || !this.map) return;
    const p = this.map.latLngToContainerPoint(latlng);
    const mapRect = this.map.getContainer().getBoundingClientRect();
    const x = mapRect.left + p.x + 14;
    const y = mapRect.top + p.y - 14;
    card.style.left = `${Math.max(8, Math.min(window.innerWidth - card.offsetWidth - 8, x))}px`;
    card.style.top = `${Math.max(50, Math.min(window.innerHeight - card.offsetHeight - 8, y))}px`;
  },

  hideProfiler() {
    const card = document.getElementById('profiler-card');
    if (card) card.classList.add('hidden');
    cancelAnimationFrame(this._profilerTimer);
  },

  // ── Marker connection lines ───────────────────────────────────────────────

  toggleConnections(force) {
    this.linksEnabled = force === undefined ? !this.linksEnabled : !!force;
    localStorage.setItem(this.LINKS_KEY, this.linksEnabled ? 'on' : 'off');
    this.renderConnections();
    return this.linksEnabled;
  },

  renderConnections() {
    if (!this.linkLayer) return;
    this.linkLayer.clearLayers();
    if (!this.linksEnabled || this.markers.length < 2) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00ff41';

    const groups = new Map();
    for (const m of this.markers) {
      for (const token of this._relationTokens(m.data)) {
        if (!groups.has(token)) groups.set(token, []);
        groups.get(token).push(m);
      }
    }

    let drawn = 0;
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length - 1; i++) {
        if (drawn >= 40) return;
        const a = group[i].marker.getLatLng();
        const b = group[i + 1].marker.getLatLng();
        L.polyline([a, b], {
          color: accent,
          weight: 1,
          opacity: 0.35,
          dashArray: '3 5',
          interactive: false,
        }).addTo(this.linkLayer);
        drawn++;
      }
    }
  },

  _relationTokens(item) {
    const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
    const tokens = new Set();

    const cves = text.match(/cve-\d{4}-\d{3,7}/g) || [];
    for (const cve of cves) tokens.add(cve);

    const apt = text.match(/\bapt\s?\d{1,3}\b/g) || [];
    for (const a of apt) tokens.add(a.replace(/\s+/g, ''));

    const known = ['lockbit', 'alphv', 'clop', 'lazarus', 'volt typhoon', 'sandworm', 'mustang panda'];
    for (const k of known) if (text.includes(k)) tokens.add(k);

    if (tokens.size === 0 && item.category) tokens.add(String(item.category).toLowerCase());
    return [...tokens];
  },

  getColor(item) {
    if (item.type === 'event') return '#00d4aa';
    switch (item.priority) {
      case 'critical': return '#ff3333';
      case 'high':     return '#ff8c00';
      case 'medium':   return '#ffd700';
      default:         return '#888888';
    }
  },

  /**
   * Look up parsed event details from Events module for rich popups.
   * Tries exact ID match first, then partial prefix match since markers.json
   * IDs and Events-generated IDs may differ in truncation.
   */
  getEventDetails(id) {
    if (typeof Events === 'undefined' || !Events.events) return null;
    // Exact match
    const exact = Events.events.find(e => e.id === id);
    if (exact) return exact;
    // Prefix match (markers.json IDs are often shorter)
    return Events.events.find(e => e.id.startsWith(id) || id.startsWith(e.id)) || null;
  },

  createPopup(item) {
    const priorityClass = item.priority || 'medium';
    const isEvent = item.type === 'event';

    // ── Rich event popup ────────────────────────────────────────────────
    if (isEvent) {
      const ev = this.getEventDetails(item.id);
      const when = ev ? this.escapeHtml(ev.when) : '';
      const where = ev ? this.escapeHtml(ev.where) : this.escapeHtml(item.location_label || '');
      const starsCount = ev ? ev.stars : 0;
      const starsStr = starsCount > 0
        ? '★'.repeat(Math.min(starsCount, 5)) + '☆'.repeat(Math.max(0, 5 - starsCount))
        : '';
      const scoreText = ev && ev.score ? `${ev.score}/10` : '';

      // Cost badge
      let costHtml = '';
      if (ev && ev.cost) {
        if (/free/i.test(ev.cost)) {
          costHtml = '<span class="cost-badge cost-free">FREE</span>';
        } else {
          const priceMatch = ev.cost.match(/[€$£]\s*\d[\d.,]*/i) || ev.cost.match(/\d[\d.,]*\s*(?:EUR|USD|GBP)/i);
          costHtml = priceMatch
            ? `<span class="cost-badge cost-paid">${this.escapeHtml(priceMatch[0].trim())}</span>`
            : `<span class="cost-badge cost-paid">${this.escapeHtml(ev.cost.slice(0, 20))}</span>`;
        }
      }

      let dateLine = '';
      if (when) {
        dateLine = `<div class="marker-popup-date">📅 ${when}</div>`;
      } else if (item.date) {
        const d = new Date(item.date + 'T00:00:00');
        const formatted = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        dateLine = `<div class="marker-popup-date">📅 ${formatted}</div>`;
      }

      return `
        <div class="marker-popup-event">
          <div class="marker-popup-meta">
            <span class="marker-popup-priority event">EVENT</span>
            ${costHtml}
          </div>
          <div class="marker-popup-title">${this.escapeHtml(item.title)}</div>
          ${dateLine}
          ${where ? `<div class="marker-popup-venue">📍 ${where}</div>` : ''}
          ${starsStr ? `<div class="marker-popup-stars"><span class="event-stars-display">${starsStr}</span>${scoreText ? ` <span class="marker-popup-score">${scoreText}</span>` : ''}</div>` : ''}
          ${item.summary ? `<div class="marker-popup-summary">${this.escapeHtml(item.summary)}</div>` : ''}
          <div class="marker-popup-actions">
            ${item.source_url ? `<a href="${this.escapeHtml(item.source_url)}" target="_blank">Event page ↗</a>` : ''}
            <button class="marker-btn-show" onclick="App.showInPanel('${item.id}','event')">View details ↓</button>
          </div>
        </div>
      `;
    }

    // ── Standard news popup ─────────────────────────────────────────────
    let dateLine = '';
    if (item.date) {
      const d = new Date(item.date + 'T00:00:00');
      const formatted = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      dateLine = `<div class="marker-popup-date">${formatted}</div>`;
    }

    return `
      <div>
        <div class="marker-popup-meta">
          <span class="marker-popup-priority ${priorityClass}">${isEvent ? 'EVENT' : (item.priority || 'medium')}</span>
          <span class="marker-popup-location">${this.escapeHtml(item.location_label || '')}</span>
        </div>
        ${dateLine}
        <div class="marker-popup-title">${this.escapeHtml(item.title)}</div>
        <div class="marker-popup-summary">${this.escapeHtml(item.summary || '')}</div>
        <div class="marker-popup-actions">
          ${item.source_url ? `<a href="${this.escapeHtml(item.source_url)}" target="_blank">Open source ↗</a>` : ''}
          <button class="marker-btn-show" onclick="App.showInPanel('${item.id}','${item.type}')">Show in panel ↓</button>
        </div>
      </div>
    `;
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Refresh markers when a new report drops.
   * Uses the merged approach so event markers are always shown.
   */
  async refresh() {
    const newsDate = (typeof App !== 'undefined' && App.activeDate) || null;
    const eventsDate = (typeof App !== 'undefined' && App.eventsSourceDate) || null;
    if (newsDate) {
      await this.loadMarkersForDateWithEvents(newsDate, eventsDate);
    } else {
      await this.loadLatestMarkers();
    }
  },
};
