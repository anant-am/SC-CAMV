type MessageCallback = (data: any) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<MessageCallback>> = new Map();
  private isConnecting = false;
  private reconnectTimeout: number | null = null;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect through Vite proxy /ws or directly to backend 8000 if needed
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        console.log('[SC-CAMV] WebSocket connection established');
        this.emit('connection', { status: 'CONNECTED' });
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type && parsed.data) {
            this.emit(parsed.type, parsed.data);
          }
        } catch (err) {
          console.warn('[SC-CAMV] WS message parse error:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.emit('connection', { status: 'DISCONNECTED' });
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.warn('[SC-CAMV] WebSocket error:', error);
        this.emit('connection', { status: 'ERROR' });
      };
    } catch (err) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 2000);
  }

  on(type: string, callback: MessageCallback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => this.off(type, callback);
  }

  off(type: string, callback: MessageCallback) {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(callback);
    }
  }

  private emit(type: string, data: any) {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error('[SC-CAMV] Error in WS callback:', e);
        }
      });
    }
  }
}

export const wsClient = new WebSocketClient();
