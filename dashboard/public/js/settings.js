/**
 * Settings panel — renders config files as formatted markdown.
 * Pencil icon toggles raw textarea editing.
 */
const Settings = {
  currentFile: 'interests.md',
  editing: false,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentFile = tab.dataset.config;
        this.editing = false;
        this.showView();
        this.loadFile();
      });
    });

    // Edit toggle
    document.getElementById('settings-edit-btn').addEventListener('click', () => {
      this.editing = !this.editing;
      if (this.editing) {
        this.showEditor();
      } else {
        this.showView();
      }
    });

    // Save
    document.getElementById('settings-save').addEventListener('click', () => this.save());

    // Cancel
    document.getElementById('settings-cancel').addEventListener('click', () => {
      this.editing = false;
      this.showView();
    });

    // Close
    document.getElementById('settings-close').addEventListener('click', () => {
      document.getElementById('settings-overlay').classList.add('hidden');
    });
  },

  open() {
    document.getElementById('settings-overlay').classList.remove('hidden');
    this.editing = false;
    this.showView();
    this.loadFile();
  },

  close() {
    document.getElementById('settings-overlay').classList.add('hidden');
  },

  async loadFile() {
    const view = document.getElementById('settings-view');
    view.innerHTML = '<div class="empty-state">Loading...</div>';

    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(this.currentFile)}`);
      if (!res.ok) throw new Error('File not found');
      const content = await res.text();

      // Render as markdown
      view.innerHTML = `<div class="markdown-body">${marked.parse(content)}</div>`;

      // Store raw content for editor
      view.dataset.raw = content;
    } catch (err) {
      view.innerHTML = `<div class="empty-state">Could not load ${this.currentFile}: ${err.message}</div>`;
    }
  },

  showView() {
    document.getElementById('settings-view').classList.remove('hidden');
    document.getElementById('settings-edit').classList.add('hidden');
  },

  showEditor() {
    const raw = document.getElementById('settings-view').dataset.raw || '';
    document.getElementById('settings-editor').value = raw;
    document.getElementById('settings-view').classList.add('hidden');
    document.getElementById('settings-edit').classList.remove('hidden');
    document.getElementById('settings-editor').focus();
  },

  async save() {
    const content = document.getElementById('settings-editor').value;
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(this.currentFile)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: content,
      });
      if (!res.ok) throw new Error('Save failed');
      this.editing = false;
      this.showView();
      await this.loadFile();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  },
};
