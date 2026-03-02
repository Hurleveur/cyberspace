/**
 * Reader — inline article reader. Replaces the Events panel content with fetched article text.
 * Uses GET /api/proxy?url=... to fetch and extract the article server-side.
 */
const Reader = {
  mode: 'events', // 'events' | 'reader'
  currentUrl: '',

  init() {
    this._patchRightPanel();
  },

  _patchRightPanel() {
    const panel = document.getElementById('right-panel');

    // Add "← Back" button to the panel header
    const header = panel.querySelector('.panel-header');
    const closeBtn = header.querySelector('.panel-close');
    const backBtn = document.createElement('button');
    backBtn.id = 'reader-back';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => this.closeReader());
    header.insertBefore(backBtn, closeBtn);

    // Add reader view container at the bottom of the panel
    const readerView = document.createElement('div');
    readerView.id = 'reader-view';
    readerView.className = 'reader-view hidden';
    panel.appendChild(readerView);
  },

  async openReader(url, title) {
    this.currentUrl = url;
    this._setMode('reader');
    App.showPanel('right');

    const view = document.getElementById('reader-view');
    view.innerHTML = '<div class="reader-loading">Fetching article…</div>';

    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        view.innerHTML = `<div class="reader-error">Could not load article: ${this._esc(data.error || 'Unknown error')}</div>`;
        return;
      }

      const displayTitle = data.title || title || 'Article';

      view.innerHTML = `
        <div class="reader-title">${this._esc(displayTitle)}</div>
        <div class="reader-body">${this._esc(data.text || '')}</div>
        <a href="${this._esc(url)}" target="_blank" rel="noopener noreferrer" class="reader-source-link">Open original ↗</a>
      `;
    } catch (err) {
      view.innerHTML = `<div class="reader-error">Error: ${this._esc(err.message)}</div>`;
    }
  },

  closeReader() {
    this._setMode('events');
  },

  _setMode(mode) {
    this.mode = mode;
    const panel = document.getElementById('right-panel');
    const h2 = panel.querySelector('.panel-header h2');
    const backBtn = document.getElementById('reader-back');
    const toolbar = panel.querySelector('.events-toolbar');
    const eventsList = document.getElementById('events-list');
    const readerView = document.getElementById('reader-view');

    if (mode === 'reader') {
      if (h2) h2.textContent = 'READER';
      backBtn.style.display = 'inline-block';
      if (toolbar) toolbar.classList.add('hidden');
      if (eventsList) eventsList.classList.add('hidden');
      if (readerView) readerView.classList.remove('hidden');
    } else {
      if (h2) h2.textContent = 'EVENT RADAR';
      backBtn.style.display = 'none';
      if (toolbar) toolbar.classList.remove('hidden');
      if (eventsList) eventsList.classList.remove('hidden');
      if (readerView) readerView.classList.add('hidden');
    }
  },

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  },
};
