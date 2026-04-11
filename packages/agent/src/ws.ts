import type { Server as HttpServer } from 'node:http';

import { WebSocketServer } from 'ws';

import type { StateStore } from './state.js';
import type { WsEvent } from './types.js';

export function attachWebSocketServer(server: HttpServer, state: StateStore): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcast = (event: WsEvent) => {
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  };

  state.subscribe(broadcast);

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({
      type: 'state-update',
      data: state.get(),
      timestamp: Date.now(),
    } satisfies WsEvent));
  });

  wss.on('close', () => {
    state.unsubscribe(broadcast);
  });

  return wss;
}
