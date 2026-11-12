import { describe, expect, it } from 'vitest';
import { SecondsBarBuilder } from './seconds-bar-builder';

const T0 = Date.UTC(2026, 10, 11, 4, 0, 0);
const tick = (offsetMs: number, price: number, cumVolume: number | null = null) => ({ at: T0 + offsetMs, price, cumVolume });

describe('FR-CH-8 SecondsBarBuilder', () => {
  it('rolls ticks of one second into OHLCV and closes it on the next second', () => {
    const b = new SecondsBarBuilder('1S');
    expect(b.onTick(tick(0, 100, 1000)).updated).toMatchObject({ time: T0, open: 100, close: 100, volume: 0 });
    b.onTick(tick(200, 102, 1010)); b.onTick(tick(400, 99, 1015));
    const next = b.onTick(tick(1100, 101, 1020));
    expect(next.closed).toEqual([{ time: T0, open: 100, high: 102, low: 99, close: 99, volume: 15 }]);
    expect(next.updated).toMatchObject({ time: T0 + 1000, open: 101, volume: 5 });
  });
  it('aligns 5S buckets to epoch multiples and keeps the boundary tick in the next bucket', () => {
    const b = new SecondsBarBuilder('5S');
    b.onTick(tick(0, 10)); b.onTick(tick(4999, 12));
    const next = b.onTick(tick(5000, 11));
    expect(next.closed?.[0]).toMatchObject({ time: T0, high: 12, close: 12 });
    expect(next.updated?.time).toBe(T0 + 5000);
    expect(new SecondsBarBuilder('5S').onTick({ at: T0 + 3000, price: 1, cumVolume: null }).updated?.time).toBe(T0);
  });
  it('emits no bars for empty seconds and ignores late ticks', () => {
    const b = new SecondsBarBuilder('1S');
    b.onTick(tick(0, 10)); b.onTick(tick(3500, 11));
    expect(b.onTick(tick(1000, 50))).toEqual({});
    expect(b.forming()?.time).toBe(T0 + 3000);
  });
  it('reports unknown volume when a tick has no cumulative volume', () => {
    const b = new SecondsBarBuilder('1S');
    expect(b.onTick(tick(0, 10)).updated?.volume).toBeNull();
  });
  it('closeDue closes the forming bar once its second has passed', () => {
    const b = new SecondsBarBuilder('15S');
    b.onTick(tick(1000, 10, 5));
    expect(b.closeDue(T0 + 14999)).toEqual([]);
    expect(b.closeDue(T0 + 15000)).toMatchObject([{ time: T0, close: 10 }]);
    expect(b.forming()).toBeNull();
  });
});
