import { describe, expect, it } from 'vitest';
import { reactionLine, signed, surpriseTone } from './event-format';

describe('event formatting', () => {
  it('colours a surprise by whether it is good for the currency', () => {
    expect(surpriseTone(0.2, 'higher-better')).toBe('up');
    expect(surpriseTone(-0.2, 'higher-better')).toBe('down');
    expect(surpriseTone(0.2, 'lower-better')).toBe('down');
    expect(surpriseTone(-0.2, 'lower-better')).toBe('up');
  });
  it('stays neutral when the direction, the spec or the surprise is unknown or zero', () => {
    expect(surpriseTone(0.2, 'unknown')).toBe('neutral');
    expect(surpriseTone(0.2, undefined)).toBe('neutral');
    expect(surpriseTone(0, 'higher-better')).toBe('neutral');
    expect(surpriseTone(null, 'higher-better')).toBe('neutral');
  });
  it('signs numbers', () => { expect(signed(0.123)).toBe('+0.12'); expect(signed(-1.5)).toBe('-1.50'); expect(signed(0)).toBe('0.00'); });
  it('writes the reaction line with short symbols and dashes for missing horizons', () => {
    expect(reactionLine({ symbol: 'NSE:NIFTY', refPrice: 100, move5Pct: 0.12, move15Pct: 0.2, move60Pct: 0.31 })).toBe('NIFTY +0.12% (5m) +0.20% (15m) +0.31% (60m)');
    expect(reactionLine({ symbol: 'MCX:CRUDEOIL', refPrice: 100, move5Pct: -0.1, move15Pct: null, move60Pct: null })).toBe('CRUDEOIL -0.10% (5m) — (15m) — (60m)');
    expect(reactionLine({ symbol: 'NSE:NIFTY', refPrice: null, move5Pct: null, move15Pct: null, move60Pct: null })).toBeNull();
  });
});
