import type { EconomicEvent, EventScorecard } from '@aitrader/contracts';
import { describe, expect, it } from 'vitest';
import { branchInstruction, briefInstruction, briefReason, formatReactions } from './event-brief';

const reaction = (symbol: string, m5: number | null, m15: number | null, m60: number | null = null) => ({ symbol, refPrice: 100, move5Pct: m5, move15Pct: m15, move60Pct: m60 });
const event: EconomicEvent = { id: 'e1', title: 'US CPI', country: 'USD', at: '2026-11-12T13:30:00.000Z', impact: 'High', forecast: '3.1%', previous: '3.0%', moves: ['NSE:NIFTY', 'US stocks'],
  spec: { measures: 'Consumer prices.', usualEffect: 'Hot CPI hits equities.', why: '', notes: '', source: 'bls', beat: 'lower-better' } };
const scorecard: EventScorecard = { title: 'US CPI', country: 'USD', spec: null,
  releases: [{ eventId: 'p1', at: '2026-10-10T13:30:00.000Z', forecast: '3.0%', previous: '2.9%', actual: '3.2%', surprise: 0.2, surpriseZ: 1, reactions: [reaction('NSE:NIFTY', -0.1, -0.4)] }],
  stats: [{ symbol: 'NSE:NIFTY', n: 8, avgAbsMove15Pct: 0.31, avgMove15WhenBeatPct: -0.25, avgMove15WhenMissPct: 0.18, followedSurprisePct: 62.5 }] };

describe('formatReactions', () => {
  it('formats each instrument and leaves out those without bars', () => {
    expect(formatReactions([reaction('NIFTY', 0.12, 0.2), reaction('BANKNIFTY', null, null), reaction('SPX', null, -0.5, 1.25)])).toEqual(
      ['NIFTY +0.12% (5m) +0.20% (15m)', 'SPX -0.50% (15m) +1.25% (60m)']);
    expect(formatReactions(undefined)).toEqual([]);
  });
});

describe('instructions', () => {
  it('asks for both branches, only the given numbers and no prediction', () => {
    const text = briefInstruction();
    expect(text).toContain('two branches: actual above forecast, and actual below forecast');
    expect(text).toContain('Use ONLY the numbers given here; do not predict the actual');
    expect(text).toContain('REPORT:');
  });
  it('asks which branch happened only when a brief is in the thread', () => {
    expect(branchInstruction(true)).toBe(' Say which branch happened (the actual vs forecast) and whether the move matched the brief.');
    expect(branchInstruction(false)).toBe('');
  });
});

describe('briefReason', () => {
  it('has the event, forecast, previous, spec, scorecard lines, positions and the instruction', () => {
    const text = briefReason(event, scorecard, [{ symbol: 'NSE:NIFTY', quantity: 50, side: 'long' }]);
    expect(text).toContain('Pre-event brief: US CPI (USD, High) is due 2026-11-12T13:30:00.000Z; forecast 3.1%, previous 3.0%.');
    expect(text).toContain('What it is: Consumer prices. Usual effect: Hot CPI hits equities. Better when: lower.');
    expect(text).toContain('- 2026-10-10: actual 3.2% vs forecast 3.0%, surprise +0.2; NSE:NIFTY -0.4%');
    expect(text).toContain('- NSE:NIFTY over 8 releases: average absolute 15m move 0.31%, after a beat -0.25%, after a miss +0.18%, followed the surprise 63% of the time');
    expect(text).toContain('The user holds: NSE:NIFTY long 50.');
    expect(text.endsWith(briefInstruction())).toBe(true);
  });
  it('says so when there is no history and no position', () => {
    const text = briefReason(event, null, []);
    expect(text).toContain('No stored history for this event.');
    expect(text).toContain('The user holds none of these instruments.');
  });
});
