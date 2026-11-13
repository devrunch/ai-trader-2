import { describe, expect, it } from 'vitest';
import { scorecardStats } from './scorecard-stats';

const r = (surprise: number | null, move15Pct: number | null, symbol = 'NSE:NIFTY') => ({ surprise, reactions: [{ symbol, refPrice: 100, move5Pct: null, move15Pct, move60Pct: null }] });

describe('scorecard stats', () => {
  it('splits moves by the sign of the surprise and counts how often the move followed it', () => {
    const [s] = scorecardStats([r(0.2, 0.4), r(0.1, -0.2), r(-0.3, -0.6), r(-0.1, 0.2), r(0, 1), r(null, 0.5), r(0.5, null)]);
    expect(s).toEqual({ symbol: 'NSE:NIFTY', n: 6, avgAbsMove15Pct: 0.4833, avgMove15WhenBeatPct: 0.1, avgMove15WhenMissPct: -0.2, followedSurprisePct: 50 });
  });
  it('gives null stats when no release has a surprise', () => {
    expect(scorecardStats([r(null, 0.3)])).toEqual([{ symbol: 'NSE:NIFTY', n: 1, avgAbsMove15Pct: 0.3, avgMove15WhenBeatPct: null, avgMove15WhenMissPct: null, followedSurprisePct: null }]);
  });
  it('returns nothing without 15-minute moves', () => { expect(scorecardStats([r(1, null)])).toEqual([]); });
});
