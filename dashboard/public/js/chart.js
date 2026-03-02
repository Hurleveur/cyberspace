/**
 * ThreatChart — SVG sparkline + bar chart of threat history from /api/stats.
 */
const ThreatChart = {
  data: [],

  init() {
    this._injectModal();
    document.getElementById('btn-chart').addEventListener('click', () => this.open());
    this.loadData();
  },

  _injectModal() {
    const modal = document.createElement('div');
    modal.id = 'chart-modal';
    modal.className = 'overlay hidden';
    modal.innerHTML = `
      <div class="chart-modal-content">
        <div class="chart-header">
          <h2>Threat Trend</h2>
          <span id="chart-streak-label" class="chart-streak"></span>
          <button id="chart-close" class="panel-close">&times;</button>
        </div>
        <div id="chart-body"></div>
        <div id="chart-legend" class="chart-legend"></div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('chart-close').addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => { if (e.target === modal) this.close(); });
  },

  async loadData() {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed');
      this.data = await res.json();
    } catch (err) {
      console.error('[chart] Error loading stats:', err);
    }
  },

  async open() {
    await this.loadData();
    this.render();
    document.getElementById('chart-modal').classList.remove('hidden');
  },

  close() {
    document.getElementById('chart-modal').classList.add('hidden');
  },

  render() {
    const body = document.getElementById('chart-body');
    const legend = document.getElementById('chart-legend');

    if (this.data.length < 2) {
      body.innerHTML = `<svg width="100%" height="200" viewBox="0 0 600 200">
        <text x="300" y="100" text-anchor="middle" fill="#444" font-family="JetBrains Mono,monospace" font-size="13">Not enough data</text>
      </svg>`;
      legend.innerHTML = '';
      return;
    }

    const d = this.data;
    const n = d.length;
    document.getElementById('chart-streak-label').textContent = `Briefing #${d[n - 1].streak}`;

    const W = 600, H = 320;
    const PAD_L = 12, PAD_R = 80, PAD_T = 16, PAD_B = 36;
    const chartW = W - PAD_L - PAD_R;

    const topH = 110;   // threat level strip height
    const sep = 18;
    const botH = H - PAD_T - topH - sep - PAD_B;

    const show = d.slice(-14);
    const showN = show.length;
    const stepX = showN > 1 ? chartW / (showN - 1) : chartW;

    const threatColors = { 1: '#00ff41', 2: '#ffd700', 3: '#ff8c00', 4: '#ff3333' };

    // ── Threat polyline ──
    const pts = show.map((s, i) => {
      const x = PAD_L + i * stepX;
      const y = PAD_T + topH - (s.threatScore / 4) * topH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    let svgParts = `<polyline points="${pts}" fill="none" stroke="#222" stroke-width="1.5"/>`;

    // Dots
    for (let i = 0; i < showN; i++) {
      const s = show[i];
      const x = PAD_L + i * stepX;
      const y = PAD_T + topH - (s.threatScore / 4) * topH;
      const col = threatColors[s.threatScore] || '#555';
      svgParts += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${col}" stroke="#0a0a0a" stroke-width="1.5">
        <title>${s.date} — ${s.threatLevel}</title>
      </circle>`;
    }

    // Divider
    const divY = PAD_T + topH + sep / 2;
    svgParts += `<line x1="${PAD_L}" y1="${divY}" x2="${W - PAD_R}" y2="${divY}" stroke="#1a1a1a" stroke-width="1"/>`;

    // ── Bar chart (4 metrics) ──
    const barMetrics = [
      { key: 'cves',       label: 'CVEs',       color: '#4fc3f7' },
      { key: 'exploits',   label: 'Exploits',   color: '#ff3333' },
      { key: 'breaches',   label: 'Breaches',   color: '#ff8c00' },
      { key: 'ransomware', label: 'Ransomware', color: '#ffd700' },
    ];

    const botY0 = PAD_T + topH + sep;
    const rowH = botH / barMetrics.length;

    for (let mi = 0; mi < barMetrics.length; mi++) {
      const { key, label, color } = barMetrics[mi];
      const maxVal = Math.max(1, ...show.map(s => s[key] || 0));
      const rowY = botY0 + mi * rowH;
      const maxBarH = rowH - 6;
      const barW = (stepX > 0 ? stepX : chartW / showN) * 0.65;

      for (let i = 0; i < showN; i++) {
        const val = show[i][key] || 0;
        const h = val > 0 ? Math.max(2, (val / maxVal) * maxBarH) : 1;
        const x = PAD_L + i * stepX - barW / 2;
        const y = rowY + maxBarH - h + 3;
        svgParts += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" opacity="0.8">
          <title>${show[i].date}: ${val} ${label}</title>
        </rect>`;
      }

      // Row label on right
      svgParts += `<text x="${W - PAD_R + 6}" y="${rowY + maxBarH / 2 + 4}" fill="${color}" font-size="9" font-family="JetBrains Mono,monospace">${label}</text>`;
    }

    // Date labels (show ~7 evenly spaced)
    const labelEvery = Math.max(1, Math.floor(showN / 7));
    for (let i = 0; i < showN; i += labelEvery) {
      const x = PAD_L + i * stepX;
      const dateStr = show[i].date.slice(5); // MM-DD
      svgParts += `<text x="${x.toFixed(1)}" y="${H - PAD_B + 14}" text-anchor="middle" fill="#444" font-size="9" font-family="JetBrains Mono,monospace" transform="rotate(-35 ${x.toFixed(1)} ${H - PAD_B + 14})">${dateStr}</text>`;
    }

    body.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svgParts}</svg>`;

    // Legend
    legend.innerHTML =
      barMetrics.map(m => `<div class="chart-legend-item"><span class="chart-legend-dot" style="background:${m.color}"></span>${m.label}</div>`).join('') +
      `<div class="chart-legend-item"><span class="chart-legend-dot" style="background:#00ff41"></span>Low</div>` +
      `<div class="chart-legend-item"><span class="chart-legend-dot" style="background:#ffd700"></span>Medium</div>` +
      `<div class="chart-legend-item"><span class="chart-legend-dot" style="background:#ff8c00"></span>High</div>` +
      `<div class="chart-legend-item"><span class="chart-legend-dot" style="background:#ff3333"></span>Critical</div>`;
  },
};
