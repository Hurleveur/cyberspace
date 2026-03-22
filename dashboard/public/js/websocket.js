/**
 * WebSocket manager — connects to the server for live file change notifications
 * and feed update events. Auto-reconnects on disconnect.
 *
 * On serverless hosts (Vercel) where WebSockets aren't supported, automatically
 * enters preview mode after detecting connection failure.
 */
const WS = {
  socket: null,
  reconnectInterval: 5000,
  reconnectTimer: null,
  listeners: {},
  previewMode: false,
  _failCount: 0,
  _maxFails: 2,  // enter preview mode after 2 consecutive failures

  init() {
    this.connect();
  },

  _enterPreviewMode() {
    this.previewMode = true;
    clearTimeout(this.reconnectTimer);
    console.log('[ws] Preview mode — live updates disabled');
    const el = document.getElementById('connection-status');
    el.textContent = 'Preview Mode';
    el.classList.add('preview');
    el.classList.remove('hidden');
  },

  connect() {
    if (this.previewMode) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);

    this.socket.onopen = () => {
      console.log('[ws] Connected');
      this._failCount = 0;
      document.getElementById('connection-status').classList.add('hidden');
      clearTimeout(this.reconnectTimer);
    };

    this.socket.onclose = () => {
      this._failCount++;
      if (this._failCount >= this._maxFails) {
        this._enterPreviewMode();
        return;
      }
      console.log('[ws] Disconnected');
      document.getElementById('connection-status').classList.remove('hidden');
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.socket.close();
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.dispatch(data);
      } catch (err) {
        console.warn('[ws] Invalid message:', event.data);
      }
    };
  },

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectInterval);
  },

  /**
   * Register a listener for a message type.
   * Usage: WS.on('file_changed', (data) => { ... })
   */
  on(type, callback) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(callback);
  },

  dispatch(data) {
    const handlers = this.listeners[data.type] || [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error('[ws] Handler error:', err);
      }
    }
  },
};
