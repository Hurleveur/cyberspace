/**
 * WebSocket manager — connects to the server for live file change notifications
 * and feed update events. Auto-reconnects on disconnect.
 */
const WS = {
  socket: null,
  reconnectInterval: 5000,
  reconnectTimer: null,
  listeners: {},

  init() {
    this.connect();
  },

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);

    this.socket.onopen = () => {
      console.log('[ws] Connected');
      document.getElementById('connection-status').classList.add('hidden');
      clearTimeout(this.reconnectTimer);
    };

    this.socket.onclose = () => {
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
