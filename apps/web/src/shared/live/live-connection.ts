import { io } from 'socket.io-client';
import { LiveClient } from './live-client';
import { LiveStore } from './live-store';

/** Last prices by `price:<instrumentId>`; read with `useLiveValue(prices, key)`. */
export const prices = new LiveStore<number>();

let client: LiveClient | undefined;

/** The page's single live connection, opened on first use (after login, so the cookie exists). */
export function liveClient(): LiveClient {
  if (!client) {
    // Reconnection is ours (LiveClient), so every recovery path is the tested one.
    const socket = io({ path: '/api/socket.io', autoConnect: false, reconnection: false, withCredentials: true, transports: ['websocket', 'polling'] });
    client = new LiveClient({ socket, store: prices, doc: document, win: window });
    client.start();
  }
  return client;
}
