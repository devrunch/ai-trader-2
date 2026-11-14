import { describe, expect, it, vi } from 'vitest';
import { OptionsService } from './options';
import type { OptionSnapshot, OptionSnapshotStore, QuotedLeg } from './ports/options-ports';

const NOW = Date.parse('2026-11-13T10:00:00Z'); // Friday 15:30 IST
const contract = (strike: number, type: 'CE' | 'PE', expiry = '2026-11-19') => ({ symbol: `NFO:NIFTY${expiry}${String(strike)}${type}`, strike, type, expiry });
const CONTRACTS = [24400, 24500, 24600].flatMap(s => [contract(s, 'CE'), contract(s, 'PE')]).concat([contract(24500, 'CE', '2026-11-26')]);

function memoryStore(): OptionSnapshotStore & { rows: OptionSnapshot[] } {
  const rows: OptionSnapshot[] = [];
  return { rows,
    save: s => { rows.push(s); return Promise.resolve(); },
    latest: (u, e, atMost) => Promise.resolve(rows.filter(r => r.underlying === u && r.expiry === e && r.takenAt <= atMost).sort((a, b) => b.takenAt - a.takenAt)[0] ?? null),
    before: (u, e, before) => Promise.resolve(rows.filter(r => r.underlying === u && r.expiry === e && r.takenAt < before).sort((a, b) => b.takenAt - a.takenAt)[0] ?? null),
    recentUnderlyings: () => Promise.resolve([]), purge: () => Promise.resolve(0) };
}
const quoted = (oi: Record<string, number>, spot = 24510): Map<string, QuotedLeg> => new Map<string, QuotedLeg>([['NSE:NIFTY 50', { ltp: spot, oi: null, volume: null }],
  ...CONTRACTS.map(c => [c.symbol, { ltp: 100, oi: oi[c.symbol] ?? 1000, volume: 5 }] as [string, QuotedLeg])]);

function setup(oi: Record<string, number> = {}) {
  const store = memoryStore();
  const quote = vi.fn((symbols: string[]) => Promise.resolve(quoted(oi)).then(m => new Map([...m].filter(([k]) => symbols.includes(k)))));
  let now = NOW;
  const service = new OptionsService({ list: (u) => Promise.resolve(u === 'NIFTY' ? { spotSymbol: 'NSE:NIFTY 50', contracts: CONTRACTS } : null) }, { quote }, store, { now: () => now });
  return { service, store, quote, advance: (ms: number) => { now += ms; } };
}
const signal = new AbortController().signal;

describe('options service', () => {
  it('builds the chain around the at-the-money strike for the nearest expiry', async () => {
    const { service } = setup();
    const chain = await service.chain('NSE:nifty', { strikes: 1 }, signal);
    expect(chain).toMatchObject({ underlying: 'NIFTY', expiry: '2026-11-19', expiries: ['2026-11-19', '2026-11-26'], spot: 24510, atm: 24500, source: 'kite' });
    expect(chain?.rows.map(r => r.strike)).toEqual([24400, 24500, 24600]);
    expect(chain?.rows[1]?.ce).toMatchObject({ ltp: 100, oi: 1000, oiChange: null });
    expect(chain?.rows[1]?.ce?.iv).toBeGreaterThan(0);
  });
  it('reuses a snapshot younger than a minute and quotes again after it', async () => {
    const { service, quote, advance } = setup();
    await service.chain('NIFTY', { strikes: 1 }, signal);
    advance(30_000);
    await service.summary('NIFTY', {}, signal);
    expect(quote).toHaveBeenCalledTimes(1);
    advance(31_000);
    await service.chain('NIFTY', { strikes: 1 }, signal);
    expect(quote).toHaveBeenCalledTimes(2);
  });
  it('reports open interest change against the last snapshot of an earlier day', async () => {
    const { service, store } = setup({ [contract(24500, 'CE').symbol]: 1500 });
    store.rows.push({ underlying: 'NIFTY', expiry: '2026-11-19', takenAt: NOW - 86_400_000, spot: 24400,
      legs: [{ ...contract(24500, 'CE'), ltp: 90, oi: 1000, volume: 1 }] });
    const chain = await service.chain('NIFTY', { strikes: 1 }, signal);
    expect(chain?.rows[1]?.ce?.oiChange).toBe(500);
    const summary = await service.summary('NIFTY', {}, signal);
    expect(summary?.buildups).toEqual([{ strike: 24500, type: 'CE', oi: 1500, oiChange: 500 }]);
    expect(summary).toMatchObject({ totalCeOi: 3500, totalPeOi: 3000 });
  });
  it('serves the last snapshot when Kite fails and throws when there is none', async () => {
    const { service, quote, advance } = setup();
    await expect(service.chain('NIFTY', { strikes: 1 }, signal)).resolves.not.toBeNull();
    quote.mockRejectedValueOnce(new Error('kite down'));
    advance(120_000);
    await expect(service.chain('NIFTY', { strikes: 1 }, signal)).resolves.toMatchObject({ fetchedAt: new Date(NOW).toISOString() });
    const cold = setup();
    cold.quote.mockRejectedValue(new Error('kite down'));
    await expect(cold.service.chain('NIFTY', { strikes: 1 }, signal)).rejects.toThrow('kite down');
  });
  it('rejects an underlying without options and an expiry that is not listed', async () => {
    const { service } = setup();
    await expect(service.chain('TCS', { strikes: 1 }, signal)).rejects.toThrow('no listed options');
    await expect(service.chain('NIFTY', { strikes: 1, expiry: '2026-12-31' }, signal)).rejects.toThrow('listed: 2026-11-19, 2026-11-26');
  });
  it('replays a stored snapshot for asOf, never calls Kite and hides later snapshots', async () => {
    const { service, store, quote } = setup();
    store.rows.push({ underlying: 'NIFTY', expiry: '2026-11-19', takenAt: NOW + 1000, spot: 1, legs: [] });
    expect(await service.chain('NIFTY', { strikes: 1, asOf: NOW }, signal)).toBeNull();
    expect(quote).not.toHaveBeenCalled();
  });
  it('captures one snapshot per listed expiry', async () => {
    const { service, store } = setup();
    expect(await service.capture('NIFTY', signal)).toBe(2);
    expect(store.rows.map(r => r.expiry)).toEqual(['2026-11-19', '2026-11-26']);
  });
});
