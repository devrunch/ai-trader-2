import { describe, expect, it } from 'vitest';
import { freshMoves, moveSymbols, type MoveWatch } from './move-watch';

const now = Date.parse('2026-11-12T05:10:00Z');

const watch = (patch: Partial<MoveWatch> = {}): MoveWatch => ({ kind: 'move', symbols: ['NSE:A', 'NSE:B'], minutes: 15, minPct: 3, direction: 'either', ...patch });
const changes = (entries: Array<[string, number | null]>) => new Map(entries);

describe('freshMoves', () => {
  it('lists instruments past the threshold strongest first in one wake-up', () => {
    const fresh = freshMoves({ seen: [] }, watch(), changes([['NSE:A', 3.2], ['NSE:B', -4.5]]), [], now);
    expect(fresh?.reason).toBe('2 instruments moved at least 3% within 15 minutes:\n- NSE:B -4.50% in 15 min\n- NSE:A +3.20% in 15 min');
    expect(fresh?.deskSymbol).toBe('NSE:B');
    expect(fresh?.ids).toEqual(['NSE:B:2026-11-12T10', 'NSE:A:2026-11-12T10']);
  });
  it('honours the direction', () => {
    const c = changes([['NSE:A', 3.2], ['NSE:B', -4.5]]);
    expect(freshMoves({ seen: [] }, watch({ direction: 'up' }), c, [], now)?.ids).toEqual(['NSE:A:2026-11-12T10']);
    expect(freshMoves({ seen: [] }, watch({ direction: 'down' }), c, [], now)?.ids).toEqual(['NSE:B:2026-11-12T10']);
    expect(freshMoves({ seen: [] }, watch({ direction: 'down' }), changes([['NSE:A', 3.2]]), [], now)).toBeNull();
  });
  it('fires at exactly minPct and never on missing data', () => {
    expect(freshMoves({ seen: [] }, watch(), changes([['NSE:A', 3]]), [], now)?.ids).toHaveLength(1);
    expect(freshMoves({ seen: [] }, watch(), changes([['NSE:A', null], ['NSE:B', 2.99]]), [], now)).toBeNull();
    expect(freshMoves({ seen: [] }, watch(), new Map(), [], now)).toBeNull();
  });
  it('reports an instrument once per IST hour: not the next minute, again in the next hour', () => {
    const c = changes([['NSE:A', 3.5]]);
    expect(freshMoves({ seen: ['NSE:A:2026-11-12T10'] }, watch(), c, [], now + 60_000)).toBeNull();
    expect(freshMoves({ seen: ['NSE:A:2026-11-12T10'] }, watch(), c, [], now + 3_600_000)?.ids).toEqual(['NSE:A:2026-11-12T11']);
  });
  it('includes universe members and caps the watch at 200 symbols', () => {
    expect(freshMoves({ seen: [] }, watch({ symbols: [], universe: 'nifty50' }), changes([['NSE:M', 5]]), ['NSE:M'], now)?.deskSymbol).toBe('NSE:M');
    const many = Array.from({ length: 300 }, (_, i) => `NSE:S${String(i)}`);
    expect(moveSymbols(watch({ symbols: ['NSE:A'] }), many)).toHaveLength(200);
    expect(moveSymbols(watch({ symbols: ['NSE:A'] }), ['NSE:A', 'NSE:M'])).toEqual(['NSE:A', 'NSE:M']);
  });
  it('words a one-directional single mover', () => {
    expect(freshMoves({ seen: [] }, watch({ direction: 'down', minutes: 60 }), changes([['NSE:A', -3.1]]), [], now)?.reason).toBe('1 instrument fell at least 3% within 60 minutes:\n- NSE:A -3.10% in 60 min');
  });
});
