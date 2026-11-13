import { describe, expect, it } from 'vitest';
import { reactionAsOf, reactionFromBars } from './reaction';

const REL = Date.parse('2026-11-11T13:30:00Z');
const bar = (min: number, open: number, close: number) => ({ time: REL + min * 60_000, open, close });
const full = [bar(0, 100, 100.1), bar(4, 100.3, 100.5), bar(14, 100.6, 101), bar(59, 101.5, 102)];

describe('reaction from 1-minute bars', () => {
  it('references the open of the release minute and reads closes of the bars ending at +5, +15 and +60', () => {
    expect(reactionFromBars(full, REL)).toEqual({ refPrice: 100, move5Pct: 0.5, move15Pct: 1, move60Pct: 2 });
  });
  it('treats a release a few seconds into the minute as that minute', () => {
    expect(reactionFromBars(full, REL + 20_000).refPrice).toBe(100);
  });
  it('returns null for a horizon whose bar is missing', () => {
    expect(reactionFromBars(full.filter(b => b.time !== REL + 14 * 60_000), REL)).toEqual({ refPrice: 100, move5Pct: 0.5, move15Pct: null, move60Pct: 2 });
  });
  it('returns all null when the release minute has no bar (a gap) even if later bars exist', () => {
    expect(reactionFromBars(full.slice(1), REL)).toEqual({ refPrice: null, move5Pct: null, move15Pct: null, move60Pct: null });
  });
  it('returns all null for a weekend release with no bars', () => {
    expect(reactionFromBars([], Date.parse('2026-11-14T10:00:00Z'))).toEqual({ refPrice: null, move5Pct: null, move15Pct: null, move60Pct: null });
  });
  it('hides moves whose horizon is after asOf', () => {
    const moves = { move5Pct: 0.5, move15Pct: 1, move60Pct: 2 };
    expect(reactionAsOf(moves, REL, REL + 59 * 60_000)).toEqual({ move5Pct: 0.5, move15Pct: 1, move60Pct: null });
    expect(reactionAsOf(moves, REL, REL + 60 * 60_000)).toEqual(moves);
    expect(reactionAsOf(moves, REL, REL + 4 * 60_000)).toEqual({ move5Pct: null, move15Pct: null, move60Pct: null });
  });
});
