import { describe, expect, it } from 'vitest';
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
  };
  const redis: FormingBarStore = { get: () => Promise.resolve(forming), set: (_, v) => { forming = v; return Promise.resolve(); }, clear: () => { forming = null; return Promise.resolve(); } };
  return { rows, daily, redis, store, read: new ReadBars(store, redis, () => start + 3 * 86400000) };
}
describe('FR-CH-5 FR-CH-6 FR-MD-2 cursor history', () => {
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
    expect((await fixture(0).read.execute('NSE:TEST', '5', { latest: true }, 5)).complete).toBe(false);
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
  it('returns an empty page with a null nextBefore', async () => {
    const cursor: BarsCursor = { latest: true };
    const page: BarsPage = await fixture(0).read.execute('NSE:TEST', '1', cursor, 1);
    expect(page).toEqual({ bars: [], nextBefore: null, complete: false });
  });
  it('rejects invalid instrument IDs and unsupported calendars', async () => {
    for (const id of ['invalid', 'UNKNOWN:TEST']) await expect(fixture().read.execute(id, '1', { latest: true }, 1)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
