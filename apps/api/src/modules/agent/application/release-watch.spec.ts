import { describe, expect, it, vi } from 'vitest';
import { currenciesOf } from '../domain/release-plan';
import { ReleaseWatch } from './release-watch';

const NOW = Date.parse('2026-11-14T03:00:00Z');
const H = 3_600_000;
const cpi = { title: 'CPI y/y', country: 'USD', at: new Date(NOW + 10 * H).toISOString() };
const rbi = { title: 'RBI Interest Rate Decision', country: 'INR', at: new Date(NOW + 2 * H).toISOString() };
const ecb = { title: 'Main Refinancing Rate', country: 'EUR', at: new Date(NOW + 5 * H).toISOString() };

function watch(titles: string[] = [], events = [cpi, rbi, ecb]) {
  const create = vi.fn().mockResolvedValue({});
  const w = new ReleaseWatch({ symbols: () => Promise.resolve(['NSE:NIFTY', 'FX:USDINR']), events: () => Promise.resolve(events) }, { titles: () => Promise.resolve(titles), create }, () => NOW);
  return { w, create };
}

describe('ReleaseWatch', () => {
  it('creates one task per release in the user currencies, with a brief before and a report after', async () => {
    const { w, create } = watch();
    expect(await w.planFor('u1')).toBe(2);
    expect(create).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Watching RBI Interest Rate Decision, out at 10:30 IST',
      trigger: { kind: 'event', countries: ['INR'], title: 'RBI Interest Rate Decision', minImpact: 'High', afterMinutes: 2, briefMinutes: 30 }, maxRuns: 3 }));
    expect(create.mock.calls.map(c => (c[1] as { title: string }).title)).toEqual(['Watching CPI y/y, out at 18:30 IST', 'Watching RBI Interest Rate Decision, out at 10:30 IST']);
    expect((create.mock.calls[1]?.[1] as { expiresInDays: number }).expiresInDays).toBeCloseTo(5 / 24);
  });
  it('skips a release that already has its task or is too close for the brief', async () => {
    const soon = { ...rbi, at: new Date(NOW + 20 * 60_000).toISOString() };
    const { w, create } = watch(['Watching CPI y/y, out at 18:30 IST'], [cpi, soon]);
    expect(await w.planFor('u1')).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('currenciesOf', () => {
  it('maps Indian, US and currency-pair symbols to the currencies that move them', () => {
    expect(currenciesOf(['NSE:INFY', 'MCX:GOLD1!', 'NASDAQ:AAPL', 'OANDA:EURJPY', 'BINANCE:BTCUSDT'])).toEqual(['INR', 'USD', 'EUR', 'JPY']);
  });
});
