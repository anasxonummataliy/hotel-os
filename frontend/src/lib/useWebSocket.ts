import { useEffect, useRef, useCallback, useState } from 'react';

export interface WSEvent {
  event_type: string;
  timestamp: string;
  service: string;
  data: Record<string, unknown>;
}

type Listener = (event: WSEvent) => void;

const listeners = new Set<Listener>();

export function subscribeWS(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const retryRef = useRef(2000);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState < 2) return;

    const ws = new WebSocket('ws://localhost:8005/ws/dashboard');
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 2000;
    };

    ws.onmessage = (e) => {
      try {
        const msg: WSEvent = JSON.parse(e.data);
        listeners.forEach(fn => fn(msg));
      } catch { }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, retryRef.current);
      retryRef.current = Math.min(retryRef.current * 1.5, 30000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  return { connected };
}
