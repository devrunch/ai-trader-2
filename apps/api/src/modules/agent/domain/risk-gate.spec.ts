import { describe, expect, it } from 'vitest';
import { checkEntry, defaultLimits } from './risk-gate';

const at = (ist: string) => Date.parse(`2026-11-11T${ist}:00+05:30`);
const limits = defaultLimits(1_000_000, 'NSE'); // 10,000 per trade, 30,000 a day, 09:35–15:00 IST
const order = { symbol: 'NSE:INFY', side: 'buy' as const, quantity: 100, entry: 1500, stopLoss: 1480, target: 1540, intraday: true };

describe('risk gate (PASS/BLOCK)', () => {
  it('passes a planned entry inside the limits and reports its planned loss', () => {
    expect(checkEntry(order, [], limits, at('10:00'))).toEqual({ pass: true, plannedLoss: 2000 });
  });

  it('blocks a missing or wrong-side stop', () => {
    expect(checkEntry({ ...order, stopLoss: undefined }, [], limits, at('10:00'))).toEqual({ pass: false, blocks: ['stop: an entry needs a stop loss'] });
    expect(checkEntry({ ...order, stopLoss: 1510 }, [], limits, at('10:00'))).toMatchObject({ pass: false, blocks: [expect.stringContaining('wrong side')] });
  });

  it('blocks too much loss, weak reward:risk, the daily cap, the entry count and duplicates', () => {
    expect(checkEntry({ ...order, quantity: 600 }, [], limits, at('10:00'))).toMatchObject({ pass: false, blocks: [expect.stringContaining('over the per-trade limit 10000.00')] });
    expect(checkEntry({ ...order, target: 1520 }, [], limits, at('10:00'))).toMatchObject({ pass: false, blocks: ['reward:risk: 1.00 is under 1.5'] });
    const today = Array.from({ length: 4 }, (_, i) => ({ symbol: `NSE:S${String(i)}`, side: 'buy' as const, plannedLoss: 7500 }));
    expect(checkEntry(order, today, limits, at('10:00'))).toMatchObject({ pass: false, blocks: [expect.stringContaining('daily loss')] });
    expect(checkEntry(order, Array.from({ length: 10 }, (_, i) => ({ symbol: `NSE:S${String(i)}`, side: 'buy' as const, plannedLoss: 0 })), limits, at('10:00')))
      .toMatchObject({ pass: false, blocks: [expect.stringContaining('trades: 10 entries today')] });
    expect(checkEntry(order, [{ symbol: 'NSE:INFY', side: 'buy', plannedLoss: 0 }], limits, at('10:00'))).toMatchObject({ pass: false, blocks: [expect.stringContaining('duplicate')] });
  });

  it('keeps intraday NSE entries inside 09:35–15:00 IST; 24-hour markets have no window', () => {
    expect(checkEntry(order, [], limits, at('09:20'))).toMatchObject({ pass: false, blocks: ['window: intraday entries run 09:35–15:00 IST, it is 09:20 IST'] });
    expect(checkEntry(order, [], limits, at('15:10')).pass).toBe(false);
    expect(checkEntry({ ...order, intraday: false }, [], limits, at('15:10')).pass).toBe(true);
    expect(checkEntry({ ...order, symbol: 'FX:EURUSD', entry: 1.1, stopLoss: 1.09, target: 1.13, quantity: 1000 }, [], defaultLimits(1_000_000, 'FX'), at('23:30')).pass).toBe(true);
  });
});
