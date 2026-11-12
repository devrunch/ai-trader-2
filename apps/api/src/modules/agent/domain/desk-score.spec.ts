import { describe, expect, it } from 'vitest';
import { scoreDecision, summarise } from './desk-score';

const bar = (open: number, high: number, low: number, close: number) => ({ time: 0, open, high, low, close });
const buy = { action: 'BUY' as const, entry: 100, stopLoss: 95, target: 110 };
const sell = { action: 'SELL' as const, entry: 100, stopLoss: 105, target: 90 };

describe('scoreDecision', () => {
  it('scores a long that reaches the target at +2R', () => {
    expect(scoreDecision(buy, [bar(100, 103, 99, 102), bar(102, 111, 101, 110)], 10)).toEqual({ outcome: 'target', r: 2, exitPrice: 110 });
  });
  it('scores a long stopped out at -1R', () => {
    expect(scoreDecision(buy, [bar(100, 101, 94, 96)], 10)).toEqual({ outcome: 'stop', r: -1, exitPrice: 95 });
  });
  it('counts the stop when one bar touches both stop and target', () => {
    expect(scoreDecision(buy, [bar(100, 111, 94, 100)], 10)).toEqual({ outcome: 'stop', r: -1, exitPrice: 95 });
  });
  it('fills a long at the open when the bar gaps below the stop', () => {
    expect(scoreDecision(buy, [bar(90, 92, 89, 91)], 10)).toEqual({ outcome: 'stop', r: -2, exitPrice: 90 });
  });
  it('exits at the last used bar close on timeout and ignores bars past the horizon', () => {
    const bars = [bar(100, 102, 99, 101), bar(101, 103, 100, 103), bar(103, 120, 90, 100)];
    expect(scoreDecision(buy, bars, 2)).toEqual({ outcome: 'timeout', r: 0.6, exitPrice: 103 });
  });
  it('scores a short that reaches the target at +2R', () => {
    expect(scoreDecision(sell, [bar(100, 101, 89, 91)], 10)).toEqual({ outcome: 'target', r: 2, exitPrice: 90 });
  });
  it('fills a short at the open when the bar gaps above the stop', () => {
    expect(scoreDecision(sell, [bar(108, 109, 107, 108)], 10)).toEqual({ outcome: 'stop', r: -1.6, exitPrice: 108 });
  });
  it('returns no-data when there are no later bars', () => {
    expect(scoreDecision(buy, [], 10)).toEqual({ outcome: 'no-data', r: null, exitPrice: null });
  });
  it('returns no-trade for a hold, missing levels and nonsensical levels', () => {
    const none = { outcome: 'no-trade', r: null, exitPrice: null };
    const bars = [bar(100, 101, 99, 100)];
    expect(scoreDecision({ action: 'HOLD', entry: null, stopLoss: null, target: null }, bars, 5)).toEqual(none);
    expect(scoreDecision({ ...buy, stopLoss: null }, bars, 5)).toEqual(none);
    expect(scoreDecision({ ...buy, stopLoss: 100 }, bars, 5)).toEqual(none);
    expect(scoreDecision({ ...buy, stopLoss: 101 }, bars, 5)).toEqual(none);
    expect(scoreDecision({ ...sell, stopLoss: 99 }, bars, 5)).toEqual(none);
  });
});

describe('summarise', () => {
  it('computes hit rate, average and total R, ignoring holds', () => {
    const s = summarise([{ outcome: 'target', r: 2 }, { outcome: 'stop', r: -1 }, { outcome: 'no-trade', r: null }, { outcome: 'timeout', r: 0.5 }]);
    expect(s).toEqual({ trades: 3, holds: 1, hitRatePct: 66.67, avgR: 0.5, totalR: 1.5, maxDrawdownR: 1 });
  });
  it('measures the largest peak-to-trough fall of the cumulative R curve', () => {
    const items = [1, -1, -2, 3, -1].map((r) => ({ outcome: r > 0 ? 'target' as const : 'stop' as const, r }));
    expect(summarise(items).maxDrawdownR).toBe(3);
  });
  it('returns nulls and zeros when there are no trades', () => {
    expect(summarise([])).toEqual({ trades: 0, holds: 0, hitRatePct: null, avgR: null, totalR: 0, maxDrawdownR: 0 });
  });
});
