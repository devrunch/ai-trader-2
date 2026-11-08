import { describe, expect, it } from 'vitest';
import { BarBuilder } from './bar-builder';
import { calendarFor } from './calendar';

const start = Date.parse('2026-11-09T09:15:00+05:30');
const bar = { time: start, open: 10, high: 10, low: 10, close: 10, volume: null };
const builder = () => new BarBuilder(calendarFor('NSE'));
// E11, E12, E13, E16.
describe('tick bar builder', () => {
  it('closes the forming bar at the boundary', () => {
    const b = builder();
    b.onTick({ at: start, price: 10 });
    expect(b.onTick({ at: start + 60000, price: 20 })).toEqual({ updated: { ...bar, time: start + 60000, open: 20, high: 20, low: 20, close: 20 }, closed: [bar] });
    expect(b.closeDue(start + 119999)).toEqual([]);
    expect(b.closeDue(start + 120000)).toHaveLength(1);
    expect(b.forming()).toBeNull();
  });
  it('ignores duplicate seq', () => {
    const b = builder();
    b.onTick({ at: start, price: 10, seq: 5, cumVolume: 100 });
    expect(b.onTick({ at: start + 1, price: 99, seq: 5, cumVolume: 200 })).toEqual({});
    expect(b.onTick({ at: start + 2, price: 99, seq: 4 })).toEqual({});
    expect(b.forming()?.high).toBe(10);
  });
  it('applies a late tick within tolerance to the closed bar', () => {
    const b = builder();
    b.onTick({ at: start, price: 10 });
    b.onTick({ at: start + 60000, price: 20 });
    expect(b.onTick({ at: start + 59999, price: 15 })).toEqual({ closed: [{ ...bar, high: 15, close: 15 }] });
    expect(b.forming()?.close).toBe(20);
  });
  it('drops a tick older than tolerance', () => {
    const b = builder();
    b.onTick({ at: start, price: 10 });
    b.onTick({ at: start + 63000, price: 20 });
    expect(b.onTick({ at: start + 59999, price: 15 })).toEqual({});
  });
  it('derives volume from cumulative volume', () => {
    const b = builder();
    b.onTick({ at: start, price: 10, cumVolume: 100 });
    b.onTick({ at: start + 1000, price: 12, cumVolume: 110 });
    expect(b.forming()?.volume).toBe(10);
    expect(b.onTick({ at: start + 60000, price: 11, cumVolume: 115 }).updated?.volume).toBe(5);
    expect(b.onTick({ at: start + 61000, price: 11, cumVolume: null }).updated?.volume).toBeNull();
  });
  it('restore continues the forming bar after restart', () => {
    const b = builder();
    b.restore({ ...bar, volume: 10 }, 100);
    expect(b.onTick({ at: start + 2000, price: 12, cumVolume: 105 }).updated).toEqual({ ...bar, high: 12, close: 12, volume: 15 });
  });
  it('uses event time for open and close on out-of-order current ticks', () => {
    const b = builder();
    b.onTick({ at: start + 2000, price: 10 });
    b.onTick({ at: start + 1000, price: 8 });
    expect(b.forming()).toEqual({ ...bar, open: 8, low: 8 });
  });
  it('ignores outside ticks and does not fabricate empty minutes', () => {
    const b = builder();
    expect(b.onTick({ at: start - 1, price: 10 })).toEqual({});
    expect(b.forming()).toBeNull();
    b.onTick({ at: start, price: 10 });
    expect(b.onTick({ at: start + 180000, price: 12 }).closed).toEqual([bar]);
  });
  it('reallocates cumulative volume between a corrected closed bar and the forming bar', () => {
    const b = builder();
    b.onTick({ at: start, price: 10, cumVolume: 100 });
    b.onTick({ at: start + 60000, price: 20, cumVolume: 120 });
    const result = b.onTick({ at: start + 59999, price: 15, cumVolume: 110 });
    expect(result.closed).toEqual([{ ...bar, high: 15, close: 15, volume: 10 }]);
    expect(result.updated?.volume).toBe(10);
  });
  it('returns intervening closed bars when a late cumulative tick changes their volume', () => {
    const b = new BarBuilder(calendarFor('NSE'), { lateToleranceMs: 180000 });
    b.onTick({ at: start, price: 10, cumVolume: 100 });
    b.onTick({ at: start + 60000, price: 20, cumVolume: 130 });
    b.onTick({ at: start + 120000, price: 30, cumVolume: 150 });
    const result = b.onTick({ at: start + 59000, price: 12, cumVolume: 110 });
    expect(result.closed?.map(value => [value.time, value.volume])).toEqual([[start, 10], [start + 60000, 20]]);
    expect(b.forming()?.volume).toBe(20);
  });
  it('orders cumulative ticks by event time within the current bar', () => {
    const b = builder();
    b.onTick({ at: start + 1000, price: 10, cumVolume: 100 });
    b.onTick({ at: start + 3000, price: 14, cumVolume: 120 });
    b.onTick({ at: start + 2000, price: 8, cumVolume: 110 });
    expect(b.forming()).toEqual({ ...bar, high: 14, low: 8, close: 14, volume: 20 });
  });
  it('accepts ticks exactly at the late tolerance and drops them after it', () => {
    const b = builder();
    b.onTick({ at: start, price: 10 });
    b.closeDue(start + 62000);
    expect(b.onTick({ at: start + 59999, price: 12 }).closed?.[0]?.high).toBe(12);
    b.closeDue(start + 62001);
    expect(b.onTick({ at: start + 59999, price: 13 })).toEqual({});
  });
  it('closes the last minute at the session close and ignores closing-time ticks', () => {
    const b = builder();
    const end = Date.parse('2026-11-09T15:30:00+05:30');
    b.onTick({ at: end - 1, price: 10 });
    expect(b.onTick({ at: end, price: 20 })).toEqual({});
    expect(b.closeDue(end)).toEqual([{ ...bar, time: end - 60000 }]);
    expect(b.closeDue(end)).toEqual([]);
  });
  it('restore clears prior state and retains a supplied cumulative baseline without a bar', () => {
    const b = builder();
    b.onTick({ at: start, price: 20, seq: 100 });
    b.restore(null, 100);
    expect(b.forming()).toBeNull();
    expect(b.onTick({ at: start, price: 10, seq: 1, cumVolume: 105 }).updated?.volume).toBe(5);
    b.restore({ ...bar, time: start - 60000 }, null);
    expect(b.forming()).toBeNull();
  });
  it('treats a reset or missing cumulative baseline as unknown instead of a negative increment', () => {
    const b = builder();
    b.onTick({ at: start, price: 10, cumVolume: 100 });
    b.onTick({ at: start + 1000, price: 10, cumVolume: 90 });
    expect(b.forming()?.volume).toBe(0);
    b.onTick({ at: start + 2000, price: 10, cumVolume: null });
    b.closeDue(start + 63000);
    expect(b.onTick({ at: start + 64000, price: 10, cumVolume: 110 }).updated?.volume).toBe(0);
  });
  it('returns defensive snapshots that do not change when more ticks arrive', () => {
    const b = builder();
    const original = b.onTick({ at: start, price: 10 }).updated;
    const snapshot = b.forming();
    if (snapshot) snapshot.high = 100;
    b.onTick({ at: start + 1, price: 11 });
    expect(original).toEqual(bar);
    expect(b.forming()?.high).toBe(11);
  });
  it('does not carry cumulative volume across exchange-local trading dates', () => {
    const b = builder();
    b.onTick({ at: start, price: 10, cumVolume: 100 });
    const tomorrow = Date.parse('2026-11-11T09:15:00+05:30');
    expect(b.onTick({ at: tomorrow, price: 10, cumVolume: 200 }).updated?.volume).toBe(0);
  });
});
