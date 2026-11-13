import { describe, expect, it } from 'vitest';
import { evaluateCondition } from './condition-eval';
import { derivedSeries, type Bar } from './derived-series';
import { presetById, PRESETS } from './presets';

const bar = (i: number, o: number, h: number, l: number, c: number, volume: number | null = 1000): Bar => ({ time: i * 86_400_000, open: o, high: h, low: l, close: c, volume });
/** n quiet bars around 100 (range 98..102, close 100), then the bar under test. */
const flat = (n: number, last: Bar): Bar[] => [...Array.from({ length: n }, (_, i) => bar(i, 100, 102, 98, 100)), { ...last, time: n * 86_400_000 }];
const fires = (id: string, bars: Bar[], extra: Record<string, Array<number | null>> = {}): boolean => {
  const p = presetById(id);
  if (!p?.condition) throw new Error('no condition');
  const series = { ...derivedSeries(bars), ...extra };
  return evaluateCondition(p.condition, series, bars.length - 1);
};
const sma = (n: number, f: (i: number) => number): number[] => Array.from({ length: n }, (_, i) => f(i));

describe('presets', () => {
  it('ships the brief\'s presets with unique ids', () => {
    expect(PRESETS.map(p => p.id)).toEqual(['breakout-volume', 'rsi-oversold', 'rsi-overbought', 'ema-cross-20-50', 'gap-up', 'gap-down', '52w-high', '52w-low', 'nr7', 'inside-bar', 'top-gainers', 'top-losers', 'unusual-volume']);
  });
  it('breakout-volume fires on a close above the prior 20-bar high with 1.5x volume, and not without either', () => {
    expect(fires('breakout-volume', flat(25, bar(0, 101, 106, 101, 105, 1600)))).toBe(true);
    expect(fires('breakout-volume', flat(25, bar(0, 101, 106, 101, 105, 1400)))).toBe(false);
    expect(fires('breakout-volume', flat(25, bar(0, 100, 102, 99, 101.5, 2000)))).toBe(false);
  });
  it('rsi-oversold and rsi-overbought compare the rsi series with 30 and 70', () => {
    const bars = flat(30, bar(0, 100, 101, 99, 100));
    const at = (x: number) => ({ rsi: bars.map(() => x) });
    expect(fires('rsi-oversold', bars, at(29.9))).toBe(true);
    expect(fires('rsi-oversold', bars, at(30))).toBe(false);
    expect(fires('rsi-overbought', bars, at(70.1))).toBe(true);
    expect(fires('rsi-overbought', bars, at(70))).toBe(false);
  });
  it('ema-cross-20-50 fires only on the bar where ema20 moves from at-or-below to above ema50', () => {
    const bars = flat(60, bar(0, 100, 101, 99, 100));
    const ema50 = bars.map(() => 100);
    const crossing = { ema50, ema20: bars.map((_, i) => i === bars.length - 1 ? 101 : 99) };
    expect(fires('ema-cross-20-50', bars, crossing)).toBe(true);
    expect(fires('ema-cross-20-50', bars, { ema50, ema20: bars.map(() => 101) })).toBe(false);
    expect(fires('ema-cross-20-50', bars, { ema50, ema20: bars.map(() => 99) })).toBe(false);
  });
  it('gap-up and gap-down need an open more than 2% from the previous close', () => {
    expect(fires('gap-up', flat(5, bar(0, 102.5, 104, 102, 103)))).toBe(true);
    expect(fires('gap-up', flat(5, bar(0, 101.5, 104, 101, 103)))).toBe(false);
    expect(fires('gap-down', flat(5, bar(0, 97.5, 98, 96, 97)))).toBe(true);
    expect(fires('gap-down', flat(5, bar(0, 98.5, 99, 96, 97)))).toBe(false);
  });
  it('52w-high and 52w-low compare the close with the prior 252 bars', () => {
    expect(fires('52w-high', flat(260, bar(0, 101, 104, 101, 103)))).toBe(true);
    expect(fires('52w-high', flat(260, bar(0, 100, 102, 99, 101)))).toBe(false);
    expect(fires('52w-high', flat(100, bar(0, 101, 104, 101, 103)))).toBe(false);
    expect(fires('52w-low', flat(260, bar(0, 99, 99, 95, 96)))).toBe(true);
    expect(fires('52w-low', flat(260, bar(0, 99, 99, 97, 99)))).toBe(false);
  });
  it('nr7 fires when the latest range is the narrowest of the last 7 bars', () => {
    const wide = sma(6, i => i).map(i => bar(i, 100, 104, 96, 100));
    expect(fires('nr7', [...wide, bar(6, 100, 101, 99.5, 100)])).toBe(true);
    expect(fires('nr7', [...wide, bar(6, 100, 106, 94, 100)])).toBe(false);
  });
  it('inside-bar needs a lower high and a higher low than the previous bar', () => {
    expect(fires('inside-bar', flat(3, bar(0, 100, 101, 99, 100)))).toBe(true);
    expect(fires('inside-bar', flat(3, bar(0, 100, 103, 99, 100)))).toBe(false);
    expect(fires('inside-bar', flat(3, bar(0, 100, 101, 97, 100)))).toBe(false);
  });
  it('unusual-volume needs more than 3x the 20-bar average', () => {
    expect(fires('unusual-volume', flat(25, bar(0, 100, 102, 98, 100, 3100)))).toBe(true);
    expect(fires('unusual-volume', flat(25, bar(0, 100, 102, 98, 100, 2900)))).toBe(false);
    expect(fires('unusual-volume', flat(25, bar(0, 100, 102, 98, 100, null)))).toBe(false);
  });
  it('top-gainers and top-losers are rankings by change percent with no condition', () => {
    expect(presetById('top-gainers')).toMatchObject({ sort: { by: 'changePct', order: 'desc' } });
    expect(presetById('top-losers')).toMatchObject({ sort: { by: 'changePct', order: 'asc' } });
    expect(presetById('top-gainers')?.condition).toBeUndefined();
  });
});

describe('derivedSeries', () => {
  it('computes change and gap against the previous close and excludes the current bar from the prior windows', () => {
    const d = derivedSeries(flat(25, bar(0, 102, 110, 101, 105, 500)));
    expect(d['changePct']?.[25]).toBeCloseTo(5);
    expect(d['gapPct']?.[25]).toBeCloseTo(2);
    expect(d['highestHigh20']?.[25]).toBe(102);
    expect(d['avgVolume20']?.[25]).toBe(1000);
    expect(d['volumeRatio']?.[25]).toBe(0.5);
    expect(d['highestHigh20']?.[19]).toBeNull();
  });
});
