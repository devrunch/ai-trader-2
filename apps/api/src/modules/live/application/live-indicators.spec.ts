import { describe, expect, it, vi } from 'vitest';
import type { Bar, IndicatorResult } from '@aitrader/contracts';
import { LiveIndicators, type IndicatorEngine } from './live-indicators';
import type { SubscriptionRef } from './live-subscriptions';

const subs: Record<string, SubscriptionRef> = {
  's1': { id: '00000000-0000-4000-8000-0000000000a1', socketId: 'sock1', instrumentId: 'NSE:INFY', interval: '5' },
  's2': { id: '00000000-0000-4000-8000-0000000000a2', socketId: 'sock2', instrumentId: 'NSE:INFY', interval: '5' },
};
const bar = (time: number, close: number): Bar => ({ time, open: close, high: close, low: close, close, volume: 1 });
const sma = { kind: 'builtin' as const, id: 'sma', inputs: { length: 2 } };

function setup() {
  const closed = vi.fn();
  const open = vi.fn((): ReturnType<IndicatorEngine['open']> => {
    const result: IndicatorResult = { instrumentId: 'NSE:INFY', resolvedId: 'NSE:INFY', interval: '5', ref: 'builtin:sma@1', inputs: { length: 2 },
      times: [1000, 2000], plots: [{ id: 'ma', values: [null, 10] }], status: { state: 'ok' } };
    return Promise.resolve({ result, stream: { push: (b: Bar) => Promise.resolve({ barTime: b.time, values: { ma: b.close } }), close: closed } });
  });
  const sent: Array<[string, string, unknown]> = [];
  const live = new LiveIndicators({ describe: (socketId, id) => Object.values(subs).find(s => s.id === id && s.socketId === socketId) ?? null },
    { open }, (socketId, event, payload) => { sent.push([socketId, event, payload]); });
  return { live, open, closed, sent };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('LiveIndicators (FR-IN-5)', () => {
  it('two sockets with the same indicator share one instance, and each bar is applied once', async () => {
    const { live, open, sent } = setup();
    expect(await live.subscribe('sock1', { subscriptionId: subs.s1?.id, indicators: [{ instanceId: 'a', indicator: sma }] })).toMatchObject({ ok: true, results: [{ instanceId: 'a' }] });
    await live.subscribe('sock2', { subscriptionId: subs.s2?.id, indicators: [{ instanceId: 'b', indicator: { ...sma, inputs: { length: 2 } } }] });
    expect(open).toHaveBeenCalledTimes(1);
    live.bar(subs.s1 as SubscriptionRef, bar(3000, 12), 7);
    live.bar(subs.s2 as SubscriptionRef, bar(3000, 12), 7); // same bar through the second subscription
    await flush();
    expect(sent).toEqual([
      ['sock1', 'indicator', { subscriptionId: subs.s1?.id, instanceId: 'a', barTime: 3000, values: { ma: 12 }, seq: 7 }],
      ['sock2', 'indicator', { subscriptionId: subs.s2?.id, instanceId: 'b', barTime: 3000, values: { ma: 12 }, seq: 7 }],
    ]);
  });

  it('a late joiner gets the series as it stands, including live updates', async () => {
    const { live } = setup();
    await live.subscribe('sock1', { subscriptionId: subs.s1?.id, indicators: [{ instanceId: 'a', indicator: sma }] });
    live.bar(subs.s1 as SubscriptionRef, bar(3000, 12), 7);
    live.bar(subs.s1 as SubscriptionRef, bar(3000, 13), 8); // the forming bar again
    await flush();
    const ack = await live.subscribe('sock2', { subscriptionId: subs.s2?.id, indicators: [{ instanceId: 'b', indicator: sma }] });
    expect(ack).toMatchObject({ ok: true, results: [{ result: { times: [1000, 2000, 3000], plots: [{ values: [null, 10, 13] }] } }] });
  });

  it('closes the instance when its last listener leaves', async () => {
    const { live, closed } = setup();
    await live.subscribe('sock1', { subscriptionId: subs.s1?.id, indicators: [{ instanceId: 'a', indicator: sma }] });
    await live.subscribe('sock2', { subscriptionId: subs.s2?.id, indicators: [{ instanceId: 'b', indicator: sma }] });
    live.ended(subs.s1?.id ?? '');
    await flush();
    expect(closed).not.toHaveBeenCalled();
    live.unsubscribe('sock2', { subscriptionId: subs.s2?.id });
    await flush();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('refuses another socket\'s subscription, bad specs, and reports an engine error per instance', async () => {
    const { live, open } = setup();
    expect(await live.subscribe('sock2', { subscriptionId: subs.s1?.id, indicators: [{ instanceId: 'a', indicator: sma }] })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await live.subscribe('sock1', { subscriptionId: subs.s1?.id, indicators: [] })).toMatchObject({ ok: false, code: 'INVALID' });
    open.mockRejectedValueOnce(Object.assign(new Error('Unknown indicator "nope"'), { code: 'VALIDATION_FAILED' }));
    expect(await live.subscribe('sock1', { subscriptionId: subs.s1?.id, indicators: [{ instanceId: 'x', indicator: { kind: 'builtin', id: 'nope', inputs: {} } }] }))
      .toMatchObject({ ok: true, results: [{ instanceId: 'x', error: { code: 'VALIDATION_FAILED', message: 'Unknown indicator "nope"' } }] });
  });
});

// FR-IN-13: an indicator whose source is another indicator on the same bar subscription.
describe('LiveIndicators chains', () => {
  const rsi = { instanceId: 'p', label: 'RSI 14', indicator: { kind: 'builtin' as const, id: 'rsi', inputs: {} } };
  const child = { instanceId: 'c', label: 'SMA 9', indicator: { kind: 'builtin' as const, id: 'sma', inputs: { source: { from: 'p', plot: 'rsi' } } } };
  const subscribe = (live: LiveIndicators, indicators: unknown[]) => live.subscribe('sock1', { subscriptionId: subs.s1?.id, indicators });

  it('hands the child the parent it points at, even when the parent comes in an earlier call', async () => {
    const { live, open } = setup();
    await subscribe(live, [rsi]);
    await subscribe(live, [child]);
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ instanceId: 'c', label: 'SMA 9', others: [rsi] }));
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('finds a parent listed after the child in the same call, and passes only what the child reaches', async () => {
    const { live, open } = setup();
    const unrelated = { instanceId: 'z', indicator: sma };
    await subscribe(live, [child, unrelated, rsi]);
    const request = open.mock.calls.find(([r]) => r.instanceId === 'c')?.[0];
    expect(request).toMatchObject({ others: [rsi] });
    expect(open.mock.calls.find(([r]) => r.instanceId === 'z')?.[0]).not.toHaveProperty('others');
  });

  it('asks the engine without a parent after the parent was removed, so the child reports it (E28)', async () => {
    const { live, open } = setup();
    await subscribe(live, [rsi, child]);
    live.unsubscribe('sock1', { subscriptionId: subs.s1?.id });
    await subscribe(live, [child]);
    expect(open.mock.calls.at(-1)?.[0]).not.toHaveProperty('others');
  });

  it('does not share an instance between chains with different parents', async () => {
    const { live, open } = setup();
    await live.subscribe('sock1', { subscriptionId: subs.s1?.id, indicators: [rsi, child] });
    await live.subscribe('sock2', { subscriptionId: subs.s2?.id, indicators: [{ ...rsi, indicator: { ...rsi.indicator, inputs: { length: 7 } } }, child] });
    expect(open.mock.calls.filter(([r]) => r.instanceId === 'c')).toHaveLength(2);
  });
});
