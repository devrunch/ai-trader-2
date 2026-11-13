import { describe, expect, it, vi } from 'vitest';
import { DepthWatcher } from './depth-watcher';

const ID = '7d9f0a2e-0000-4000-8000-000000000001';
const response = (unavailable: string) => ({ depth: null, unavailable });
const push = (seq: number, unavailable = 'Market closed') => ({ subscriptionId: ID, seq, instrumentId: 'NSE:TEST', response: response(unavailable) });
function setup(connected = true) {
  const listeners = new Map<string, (p: unknown) => void>(); const acks: Array<(raw: unknown) => void> = [];
  const socket = { connected, on: (e: string, f: (p: unknown) => void) => { listeners.set(e, f); },
    emit: vi.fn((event: string, _payload: unknown, ack?: (raw: unknown) => void) => { if (event === 'subscribeDepth' && ack) acks.push(ack); }) };
  return { socket, watcher: new DepthWatcher(socket), deliver: (p: unknown) => { listeners.get('depth')?.(p); }, ack: () => { acks.shift()?.({ ok: true, subscriptionId: ID }); } };
}

describe('DepthWatcher', () => {
  it('subscribes once per symbol and delivers pushes in order, dropping stale seq', () => {
    const { socket, watcher, deliver, ack } = setup(); const a = vi.fn(); const b = vi.fn();
    watcher.watch('NSE:TEST', a); watcher.watch('NSE:TEST', b); ack();
    expect(socket.emit.mock.calls.filter(c => c[0] === 'subscribeDepth')).toHaveLength(1);
    deliver(push(1)); deliver(push(3, 'Feed down')); deliver(push(2, 'Not subscribed yet')); deliver(push(3));
    expect(a.mock.calls).toEqual([[response('Market closed')], [response('Feed down')]]);
    expect(b).toHaveBeenCalledTimes(2);
  });
  it('applies a push that arrives before its ack', () => {
    const { watcher, deliver, ack } = setup(); const a = vi.fn();
    watcher.watch('NSE:TEST', a); deliver(push(1)); expect(a).not.toHaveBeenCalled(); ack();
    expect(a).toHaveBeenCalledWith(response('Market closed'));
  });
  it('unsubscribes when the last handler leaves and resubscribes with a fresh count after reconnect', () => {
    const { socket, watcher, deliver, ack } = setup(); const a = vi.fn();
    const off = watcher.watch('NSE:TEST', a); ack(); deliver(push(5));
    watcher.onDisconnect(); watcher.onConnect(); ack(); deliver(push(1, 'Feed down'));
    expect(a).toHaveBeenLastCalledWith(response('Feed down'));
    off();
    expect(socket.emit).toHaveBeenCalledWith('unsubscribeDepth', { subscriptionId: ID });
  });
  it('waits for the connection before subscribing', () => {
    const { socket, watcher } = setup(false);
    watcher.watch('NSE:TEST', vi.fn()); expect(socket.emit).not.toHaveBeenCalled();
    watcher.onConnect(); expect(socket.emit).toHaveBeenCalledWith('subscribeDepth', { symbol: 'NSE:TEST' }, expect.any(Function));
  });
});
