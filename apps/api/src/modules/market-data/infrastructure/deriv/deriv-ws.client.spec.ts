import { afterEach, describe, expect, it, vi } from 'vitest';
import { DerivWsClient, requestDeriv } from './deriv-ws.client';
import { derivRequest } from './deriv.messages';

const opened = vi.hoisted(() => vi.fn<(url: URL) => void>());
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  return { default: class extends EventEmitter {
    private terminated = false;
    constructor(url: URL) { super(); opened(url); queueMicrotask(() => { this.emit('open'); }); }
    send(payload: string, cb: (error?: Error) => void): void {
      const command: unknown = JSON.parse(payload);
      if (typeof command === 'object' && command !== null && 'req_id' in command) {
        queueMicrotask(() => { this.emit('message', Buffer.from(JSON.stringify({ req_id: command.req_id, candles: [] }))); });
      }
      cb();
    }
    terminate(): void { if (!this.terminated) { this.terminated = true; queueMicrotask(() => { this.emit('close'); }); } }
  } };
});
describe('FR-MD-1 Deriv endpoint', () => {
  afterEach(() => { opened.mockClear(); });
  it('uses the public endpoint without app_id', async () => {
    const client = new DerivWsClient({}, new Map());
    try {
      await client.connect(new AbortController().signal);
      expect(opened.mock.calls[0]?.[0].href).toBe('wss://api.derivws.com/trading/v1/options/ws/public');
      await requestDeriv({}, derivRequest.history('frxEURUSD', 60, 1000, 1), new AbortController().signal);
      expect(opened.mock.calls.map(([url]) => url.href)).toEqual([
        'wss://api.derivws.com/trading/v1/options/ws/public',
        'wss://api.derivws.com/trading/v1/options/ws/public',
      ]);
    } finally { client.close(); }
  });
});
