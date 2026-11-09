import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { LiveGateway } from './live.gateway';

describe('LiveGateway handshake (NFR-SC-1)', () => {
  let gateway: LiveGateway | undefined;
  let client: Socket | undefined;
  afterEach(async () => { client?.disconnect(); await gateway?.close(); client = undefined; gateway = undefined; });

  it('unauthenticated connect is rejected', async () => {
    const server = createServer();
    gateway = new LiveGateway({ execute: vi.fn().mockResolvedValue(null) });
    gateway.attach(server);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listening address');
    client = io(`http://127.0.0.1:${String(address.port)}`, { path: '/api/socket.io', transports: ['websocket'], reconnection: false });
    const error = await new Promise<Error>(resolve => client?.once('connect_error', resolve));
    expect(socketErrorData(error)).toEqual({ code: 'UNAUTHORIZED' });
  });

  it('disconnects and emits session_expired after the session check fails', async () => {
    vi.useFakeTimers();
    const current = vi.fn().mockResolvedValueOnce({ id: 'user-1', username: 'u', role: 'user' }).mockResolvedValue(null);
    const server = createServer();
    gateway = new LiveGateway({ execute: current }, { sessionCheckMs: 50 });
    gateway.attach(server);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listening address');
    client = io(`http://127.0.0.1:${String(address.port)}`, { path: '/api/socket.io', transports: ['websocket'], extraHeaders: { cookie: 'aitrader_session=valid' }, reconnection: false });
    await new Promise<void>(resolve => client?.once('connect', () => { resolve(); }));
    const expired = new Promise<void>(resolve => client?.once('session_expired', () => { resolve(); }));
    await vi.advanceTimersByTimeAsync(50);
    await expired;
    expect(current).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('answers time with the server clock (E14)', async () => {
    const server = createServer();
    gateway = new LiveGateway({ execute: vi.fn().mockResolvedValue({ id: 'user-1', username: 'u', role: 'user' }) }, { now: () => 1_794_210_349_000 });
    gateway.attach(server);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listening address');
    client = io(`http://127.0.0.1:${String(address.port)}`, { path: '/api/socket.io', transports: ['websocket'], extraHeaders: { cookie: 'aitrader_session=valid' }, reconnection: false });
    await new Promise<void>(resolve => client?.once('connect', () => { resolve(); }));
    const reply: unknown = await client.timeout(2000).emitWithAck('time');
    expect(reply).toEqual({ now: 1_794_210_349_000 });
  });
});

function socketErrorData(error: Error): unknown {
  const value: unknown = error;
  return typeof value === 'object' && value !== null && 'data' in value ? value.data : undefined;
}
