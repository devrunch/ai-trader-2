import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import type { Depth } from '@aitrader/contracts';
import type { Tick } from '../../application/ports/live-feed';
import { ReadDepth } from '../../application/read-depth';
import { RecordDepth } from '../../application/record-depth';
import { KiteWsClient } from './kite-ws.client';

// FR-MD-2: a recorded Kite full-mode frame (RELIANCE 738561, 5 bid and 5 ask levels) flows through the ticker client, the recorder, the store and ReadDepth.
const fixture = z.object({ framesBySize: z.record(z.string(), z.array(z.string())) }).parse(
  JSON.parse(readFileSync(resolve(__dirname, 'kite-live-frames.fixture.json'), 'utf8')));
let server: WebSocketServer | undefined; let client: KiteWsClient | undefined;
afterEach(async () => {
  client?.close(); for (const s of server?.clients ?? []) s.terminate();
  await new Promise<void>(r => { if (server) server.close(() => { r(); }); else r(); });
});

it('exposes the recorded 5-level book through ReadDepth', async () => {
  const frame = Buffer.from(fixture.framesBySize['218']?.[0] ?? '', 'hex');
  server = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(server, 'listening');
  const address = server.address(); if (typeof address === 'string' || !address) throw new Error('no address');
  client = new KiteWsClient({ apiKey: 'k', accessToken: 't', root: `ws://127.0.0.1:${String(address.port)}/`, warn: () => undefined,
    mappings: new Map([['738561', { id: 'NSE:RELIANCE', token: 738561, volume: true }]]) });
  const ticks = new Promise<Tick[]>(res => { client?.onMessage(res); });
  await client.connect(new AbortController().signal); client.sendSubscribe(['738561']);
  for (const s of server.clients) s.send(frame);
  const received = await ticks;

  const stored = new Map<string, Depth>(); let emit: (t: Tick) => void = () => undefined;
  const store = { get: (id: string) => Promise.resolve(stored.get(id) ?? null), last: () => Promise.resolve(null), set: (id: string, d: Depth) => { stored.set(id, d); return Promise.resolve(); } };
  new RecordDepth(store, { clock: () => 0, log: () => undefined }).attach({ name: 'kite', onTick: listener => { emit = listener; return () => undefined; } });
  for (const tick of received) emit(tick);
  const read = new ReadDepth(store, { get: () => Promise.resolve({ state: 'live', at: 0 }) }, { acquire: () => Promise.resolve(), release: () => Promise.resolve() });
  const { depth, unavailable } = await read.execute('NSE:RELIANCE');

  expect(unavailable).toBeNull();
  expect(depth).toMatchObject({ instrumentId: 'NSE:RELIANCE', source: 'kite', levels: '5' });
  expect(depth?.bids).toHaveLength(5); expect(depth?.asks).toHaveLength(5);
  expect(depth?.bids[0]).toEqual({ price: 1329, quantity: 4090, orders: 1 });
  expect(depth?.asks[0]).toEqual({ price: 1329.2, quantity: 1367, orders: 8 });
  expect(depth).toMatchObject({ at: 1794209750000, spread: 0.2, spreadPct: 0.01504778, totalBidQty: 8449, totalAskQty: 8450, imbalance: -0.00005918 });
});
