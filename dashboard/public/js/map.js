/**
 * World map — Leaflet with CartoDB Dark Matter tiles.
 * Loads markers from markers.json via the file API.
 */
const MapView = {
  map: null,
  markers: [],
  markerLayer: null,

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

    // Load markers for latest report
    this.loadLatestMarkers();
  },

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

  plotMarkers(data) {
    this.markerLayer.clearLayers();
    this.markers = [];

    for (const item of data) {
      if (item.lat == null || item.lng == null) continue;

      const color = this.getColor(item);
      const radius = item.priority === 'critical' ? 8 : item.priority === 'high' ? 7 : 6;
      const isRead = ReadTracker.isRead(item.id);

      const marker = L.circleMarker([item.lat, item.lng], {
        radius,
        fillColor: color,
        color: color,
        weight: isRead ? 1 : 2,
        opacity: isRead ? 0.3 : 0.9,
        fillOpacity: isRead ? 0.15 : 0.5,
        className: isRead ? '' : 'marker-unread',
      });

      marker.itemData = item;

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
    }
  },

  getColor(item) {
    if (item.type === 'event') return '#00d4aa';
    switch (item.priority) {
      case 'critical': return '#ff3333';
      case 'high': return '#ff8c00';
      case 'medium': return '#ffd700';
      default: return '#888888';
    }
  },

  createPopup(item) {
    const priorityClass = item.priority || 'medium';
    const isEvent = item.type === 'event';

    let dateLine = '';
    if (item.date) {
      const d = new Date(item.date + 'T00:00:00');
      const formatted = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      dateLine = `<div class="marker-popup-date">${isEvent ? '📅 ' : ''}${formatted}</div>`;
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
          <button class="marker-btn-show" onclick="App.showInPanel('${item.id}')">Show in panel ↓</button>
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
   */
  async refresh() {
    await this.loadLatestMarkers();
  },
};
