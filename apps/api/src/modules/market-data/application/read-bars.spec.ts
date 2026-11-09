import { describe, expect, it, vi } from 'vitest';
import type { Bar } from '../domain/bar';
import { ReadBars, type CandleStore, type FormingBarStore, type BarsCursor, type BarsPage } from './index';

const start = Date.parse('2026-11-09T03:45:00Z');
const bar = (time: number, price = 10): Bar => ({ time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 });
function fixture(minutes = 20) {
  const rows = Array.from({ length: minutes }, (_, i) => bar(start + i * 60000, i + 10));
  const daily: Bar[] = [];
  let forming: Awaited<ReturnType<FormingBarStore['get']>> = null;
  const store: CandleStore = {
    upsert1m: () => Promise.resolve({ written: 0, repaired: 0 }), upsert1d: () => Promise.resolve({ written: 0, repaired: 0 }),
    range1m: (_, from, to) => Promise.resolve(rows.filter(b => b.time >= from && b.time < to)),
    range1d: (_, from, to) => Promise.resolve(daily.filter(b => b.time >= Date.parse(from) && b.time < Date.parse(to))),
    earliest: (_, isDaily) => Promise.resolve((isDaily ? daily : rows)[0]?.time ?? null),
    latest1m: () => Promise.resolve(rows.at(-1)?.time ?? null),
    instrumentsWith1m: () => Promise.resolve(['NSE:TEST']),
  };
  const redis: FormingBarStore = { get: () => Promise.resolve(forming), set: (_, v) => { forming = v; return Promise.resolve(); }, clear: () => { forming = null; return Promise.resolve(); } };
  const reader = new ReadBars(store, redis, () => start + 3 * 86400000);
  const read = { execute: async (...args: Parameters<ReadBars['execute']>): Promise<BarsPage> => {
    const result = await reader.execute(...args);
    if (!('bars' in result)) throw new Error(`Expected page: ${result.reason}`);
    return result;
  } };
  return { rows, daily, redis, store, read, reader };
}
describe('FR-CH-5 FR-CH-6 FR-MD-2 cursor history', () => {
  it('read-through fills missing history once and re-reads', async () => {
    const f = fixture(0);
    const execute = vi.fn().mockImplementation(() => {
      f.rows.push(bar(start));
      return Promise.resolve({ ok: true, data: { written: 1, repaired: 0 } });
    });
    const read = new ReadBars(f.store, f.redis, () => start + 60000, { execute });
    const page = await read.execute('NSE:TEST', '1', { since: start }, 1);
    expect(page).toMatchObject({ bars: [bar(start)], status: { ok: true } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.slice(0, 4)).toEqual(['NSE:TEST', '1m', start, start + 60001]);
  });
  it('latest reads fill the missing tail once per minute (E7, E8)', async () => {
    const f = fixture(20); // 09:15–09:34 IST stored; the clock is after the 15:30 close
    let now = Date.parse('2026-11-09T18:00:00+05:30');
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { written: 5, repaired: 0 } });
    const read = new ReadBars(f.store, f.redis, () => now, { execute });
    await read.execute('NSE:TEST', '5', { latest: true }, 2);
    const tail = execute.mock.calls.find(call => call[2] === start + 20 * 60000);
    expect(tail?.slice(0, 4)).toEqual(['NSE:TEST', '1m', start + 20 * 60000, Date.parse('2026-11-09T15:30:00+05:30')]);
    const calls = execute.mock.calls.length;
    await read.execute('NSE:TEST', '5', { latest: true }, 2);
    expect(execute.mock.calls.length).toBe(calls);
    now += 61_000;
    await read.execute('NSE:TEST', '5', { latest: true }, 2);
    expect(execute.mock.calls.length).toBe(calls + 1);
  });
  it('a tail the vendor cannot fill is not asked again until new minutes are due (closing auction)', async () => {
    const f = fixture(20);
    let now = Date.parse('2026-11-09T18:00:00+05:30');
    const execute = vi.fn().mockResolvedValue({ ok: false, reason: 'NO_DATA' });
    const read = new ReadBars(f.store, f.redis, () => now, { execute });
    const tailCalls = () => execute.mock.calls.filter(call => call[2] === start + 20 * 60000).length;
    await read.execute('NSE:TEST', '5', { latest: true }, 2);
    expect(tailCalls()).toBe(1);
    now += 10 * 60_000;
    await read.execute('NSE:TEST', '5', { latest: true }, 2);
    expect(tailCalls()).toBe(1);
    now = Date.parse('2026-11-11T10:00:00+05:30'); // next session (10 Nov is a holiday): new minutes are due
    await read.execute('NSE:TEST', '5', { latest: true }, 2);
    expect(tailCalls()).toBe(2);
  });
  it('before pages never fill the tail', async () => {
    const f = fixture(20);
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { written: 0, repaired: 0 } });
    const read = new ReadBars(f.store, f.redis, () => Date.parse('2026-11-09T18:00:00+05:30'), { execute });
    await read.execute('NSE:TEST', '5', { before: start + 20 * 60000 }, 2);
    expect(execute.mock.calls.some(call => call[2] === start + 20 * 60000)).toBe(false);
  });
  it('failed fill with existing bars returns stale with reason', async () => {
    const f = fixture(1); const execute = vi.fn().mockResolvedValue({ ok: false, reason: 'AUTH_EXPIRED' });
    const read = new ReadBars(f.store, f.redis, () => start + 60000, { execute });
    expect(await read.execute('NSE:TEST', '1', { latest: true }, 10)).toMatchObject({
      bars: [bar(start)], status: { ok: false, reason: 'AUTH_EXPIRED' },
    });
    expect(execute).toHaveBeenCalledOnce();
  });
  it('fills daily history from the aligned window for weekly reads', async () => {
    const f = fixture(0); const execute = vi.fn().mockResolvedValue({ ok: false, reason: 'NO_DATA' });
    const read = new ReadBars(f.store, f.redis, () => start + 60000, { execute });
    await read.execute('NSE:TEST', '1W', { since: start }, 1);
    expect(execute.mock.calls[0]?.slice(0, 3)).toEqual(['NSE:TEST', '1d', Date.parse('2026-11-07T18:30:00Z')]);
  });
  it('latest returns the last N 5m bars aggregated on the session grid', async () => {
    const page = await fixture().read.execute('NSE:TEST', '5', { latest: true }, 2);
    expect(page.bars).toEqual([{ ...bar(start + 600000, 20), high: 25, close: 24, volume: 5 },
      { ...bar(start + 900000, 25), high: 30, close: 29, volume: 5 }]);
    expect(page.nextBefore).toBe(start + 600000); expect(page.complete).toBe(true);
  });
  it('before pages backwards without overlap', async () => {
    const { read } = fixture();
    const first = await read.execute('NSE:TEST', '5', { latest: true }, 2);
    const second = await read.execute('NSE:TEST', '5', { before: first.nextBefore ?? 0 }, 2);
    expect(second.bars.map(b => b.time)).toEqual([start, start + 300000]);
  });
  it('since returns bars from the cursor inclusive', async () => {
    expect((await fixture().read.execute('NSE:TEST', '5', { since: start + 300000 }, 2)).bars.map(b => b.time))
      .toEqual([start + 300000, start + 600000]);
  });
  it('merges the forming bar as the newest bar', async () => {
    const { read, redis } = fixture(); const newest = bar(start + 1200000, 40);
    await redis.set('NSE:TEST', { bar: newest, lastCumVolume: 42, seq: 8 });
    expect((await read.execute('NSE:TEST', '5', { latest: true }, 2)).bars.at(-1)).toEqual(newest);
  });
  it('weekly and monthly aggregate from daily bars', async () => {
    const { read, daily } = fixture(0);
    daily.push(bar(Date.parse('2026-11-08T18:30:00Z'), 10), bar(Date.parse('2026-11-10T18:30:00Z'), 20));
    for (const interval of ['1W', '1M'] as const) {
      const page = await read.execute('NSE:TEST', interval, { latest: true }, 1);
      expect(page.bars).toHaveLength(1); expect(page.bars[0]).toMatchObject({ open: 10, close: 20, high: 21, low: 9, volume: 2 });
    }
  });
  it('complete is false when the store has no older data', async () => {
    expect(await fixture(0).reader.execute('NSE:TEST', '5', { latest: true }, 5)).toEqual({ ok: false, reason: 'UNSUPPORTED' });
    expect((await fixture().read.execute('NSE:TEST', '5', { latest: true }, 5)).complete).toBe(false);
  });
  it('rejects limit outside 1..5000', async () => {
    for (const limit of [0, -1, 5001, 1.5, NaN]) await expect(fixture().read.execute('NSE:TEST', '5', { latest: true }, limit)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
  it('widens the read window across sparse sessions', async () => {
    const { rows, read } = fixture();
    rows.unshift(bar(start - 28 * 86400000));
    const page = await read.execute('NSE:TEST', '5', { latest: true }, 5);
    expect(page.bars.map(b => b.time)).toEqual([start - 28 * 86400000, start, start + 300000, start + 600000, start + 900000]);
  });
  it('does not include forming data in before pages or replace newer stored bars', async () => {
    const { read, redis } = fixture();
    await redis.set('NSE:TEST', { bar: bar(start + 300000, 999), lastCumVolume: null, seq: null });
    expect((await read.execute('NSE:TEST', '1', { latest: true }, 1)).bars[0]?.close).toBe(29);
    await redis.set('NSE:TEST', { bar: bar(start + 1200000), lastCumVolume: null, seq: null });
    expect((await read.execute('NSE:TEST', '1', { before: start + 1200001 }, 1)).bars[0]?.time).toBe(start + 1140000);
    await redis.clear('NSE:TEST'); expect(await redis.get('NSE:TEST')).toBeNull();
  });
  it('combines a forming minute with the stored minutes in its bucket', async () => {
    const { read, redis } = fixture(19);
    await redis.set('NSE:TEST', { bar: bar(start + 1140000, 50), lastCumVolume: null, seq: null });
    expect((await read.execute('NSE:TEST', '5', { latest: true }, 1)).bars[0]).toMatchObject({ time: start + 900000, open: 25, close: 50, volume: 5 });
  });
  it('returns daily rows directly and does not include future dates', async () => {
    const { read, daily } = fixture(0);
    daily.push(bar(Date.parse('2026-11-09')), bar(Date.parse('2026-11-11')), bar(Date.parse('2026-11-13')));
    expect((await read.execute('NSE:TEST', '1D', { since: Date.parse('2026-11-11') }, 5)).bars).toEqual([daily[1]]);
  });
  it('anchors a forming daily bar to the exchange date', async () => {
    const { read, redis } = fixture(0);
    await redis.set('NSE:TEST', { bar: bar(start), lastCumVolume: null, seq: null });
    expect((await read.execute('NSE:TEST', '1D', { latest: true }, 1)).bars[0]?.time).toBe(Date.parse('2026-11-08T18:30:00Z'));
  });
  it('aggregates US daily dates on the correct local trading dates', async () => {
    const { read, daily } = fixture(0);
    daily.push(bar(Date.parse('2026-11-09T05:00:00Z'), 10), bar(Date.parse('2026-11-11T05:00:00Z'), 20));
    expect((await read.execute('NYSE:TEST', '1W', { latest: true }, 1)).bars[0]).toMatchObject({ time: Date.parse('2026-11-09T05:00:00Z'), open: 10, close: 20 });
  });
  it('returns a typed failure when no bars exist and history is unsupported', async () => {
    const cursor: BarsCursor = { latest: true };
    expect(await fixture(0).reader.execute('NSE:TEST', '1', cursor, 1)).toEqual({ ok: false, reason: 'UNSUPPORTED' });
  });
  it('rejects invalid instrument IDs and unsupported calendars', async () => {
    for (const id of ['invalid', 'UNKNOWN:TEST']) await expect(fixture().read.execute(id, '1', { latest: true }, 1)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
