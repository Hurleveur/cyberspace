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
  geoCache: {},

  GEO_CACHE_KEY: 'cyberspace-geocache',

  init() {
    this.map = L.map('map', {
      center: [50.85, 4.35], // Brussels
      zoom: 4,
      minZoom: 2,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
      zoomControl: false,
      attributionControl: true,
    });

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(this.map);

    // Marker layer group
    this.markerLayer = L.layerGroup().addTo(this.map);

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
      if (!res.ok) return;
      const { date } = await res.json();
      await this.loadMarkersForDate(date);
    } catch (err) {
      console.warn('[map] No markers available:', err.message);
    }
  },

  async loadMarkersForDate(date) {
    try {
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
      try {
        const res = await fetch(`/api/file?path=reports/${newsDate}/markers.json`);
        if (res.ok) {
          newsMarkers = JSON.parse(await res.text());
        }
      } catch (err) {
        console.warn('[map] Could not load markers.json for', newsDate, err.message);
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

    this.plotMarkers(merged);
  },

  plotMarkers(data) {
    this.markerLayer.clearLayers();
    this.markers = [];

    const needsGeocoding = [];

    for (const item of data) {
      if (item.lat != null && item.lng != null) {
        // Already has coordinates — place immediately
        this.addMarker(item);
      } else if (item.location_label && !/^global$/i.test(item.location_label.trim())) {
        // Check the local cache first before queueing a network request
        const cached = this.geoCache[item.location_label];
        if (cached) {
          this.addMarker({ ...item, lat: cached.lat, lng: cached.lng });
        } else if (cached === undefined) {
          // Not yet tried — queue for Nominatim
          needsGeocoding.push(item);
        }
        // cached === null means previously tried and failed — skip
      }
    }

    // Geocode queued items sequentially (Nominatim max 1 req/sec)
    if (needsGeocoding.length > 0) {
      this.geocodePending(needsGeocoding);
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
        this.addMarker({ ...item, lat: coords.lat, lng: coords.lng });
      }
      // Wait ≥1 second between requests as required by Nominatim ToS
      await new Promise(r => setTimeout(r, 1100));
    }
  },

  // ── Marker creation ──────────────────────────────────────────────────────────

  addMarker(item) {
    const color = this.getColor(item);
    const radius = item.priority === 'critical' ? 8 : item.priority === 'high' ? 7 : 6;
    const isRead = ReadTracker.isRead(item.id);
    const isCritical = item.priority === 'critical';

    let className = '';
    if (!isRead) className = isCritical ? 'marker-unread marker-critical' : 'marker-unread';

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

    marker.bindPopup(() => this.createPopup(item), {
      maxWidth: 320,
      minWidth: 240,
      className: 'dark-popup',
    });

    marker.on('popupopen', () => {
      ReadTracker.markRead(item.id);
      marker.setStyle({ opacity: 0.3, fillOpacity: 0.15, weight: 1 });
      App.updateUnreadCount();
    });

    this.markerLayer.addLayer(marker);
    this.markers.push({ marker, data: item });
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
