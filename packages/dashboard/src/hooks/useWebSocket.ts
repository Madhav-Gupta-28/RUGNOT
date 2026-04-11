import { useEffect, useRef } from 'react';

import { useRugnotStore } from '../store';
import type { AgentState, WsEvent } from '../lib/types';

const REFRESH_EVENTS = new Set<WsEvent['type']>(['verdict', 'trade', 'threat', 'exit']);

function resolveWebSocketUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) {
    return explicit;
  }

  if (import.meta.env.DEV) {
    return 'ws://localhost:3001/ws';
  }

  if (typeof window !== 'undefined' && window.location?.host) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws`;
  }

  return 'ws://localhost:3001/ws';
}

export function useWebSocket() {
  const addEvent = useRugnotStore((store) => store.addEvent);
  const updateState = useRugnotStore((store) => store.updateState);
  const fetchState = useRugnotStore((store) => store.fetchState);
  const reconnectTimer = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let isUnmounted = false;

    const connect = () => {
      if (isUnmounted) {
        return;
      }

      const socket = new WebSocket(resolveWebSocketUrl());
      socketRef.current = socket;

      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data as string) as WsEvent;
          addEvent(event);

          if (event.type === 'state-update' && typeof event.data === 'object' && event.data !== null) {
            updateState(event.data as Partial<AgentState>);
          }

          if (REFRESH_EVENTS.has(event.type)) {
            void fetchState();
          }
        } catch (error) {
          console.warn('[WS] Failed to parse event', error);
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (!isUnmounted) {
          reconnectTimer.current = window.setTimeout(connect, 3000);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
      }
      socketRef.current?.close();
    };
  }, [addEvent, fetchState, updateState]);
}
