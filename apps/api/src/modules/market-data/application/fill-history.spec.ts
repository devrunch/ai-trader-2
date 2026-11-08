import { describe, expect, it } from 'vitest';
import { FillHistory } from './fill-history';
import { historyBar, historyFixture, historySignal } from './history.spec-helper';

describe('FR-MD-1 FR-MD-2 fill history', () => {
  it('stores fetched bars and reports written', async () => {
    const f = historyFixture(); const fill = new FillHistory(f.store, f.instruments, f.providers);
    const signal = historySignal();
    expect(await fill.execute('NSE:TEST', '1m', 0, 100, signal)).toEqual({ ok: true, data: { written: 1, repaired: 0 } });
    expect(f.store.upsert1m).toHaveBeenCalledExactlyOnceWith('NSE:TEST', [historyBar], 'kite', signal);
    await fill.execute('NSE:TEST', '1d', 0, 100, signal);
    expect(f.store.upsert1d).toHaveBeenCalledOnce();
  });
  it('single-flights concurrent fills', async () => {
    const f = historyFixture(); const fill = new FillHistory(f.store, f.instruments, f.providers);
    const results = await Promise.all(Array.from({ length: 5 }, () => fill.execute('NSE:TEST', '1m', 0, 100, historySignal())));
    expect(f.history).toHaveBeenCalledOnce(); expect(f.store.upsert1m).toHaveBeenCalledOnce();
    expect(results.every(r => r.ok)).toBe(true);
    await fill.execute('NSE:TEST', '1m', 0, 100, historySignal()); expect(f.history).toHaveBeenCalledTimes(2);
  });
  it('no mapping gives UNSUPPORTED', async () => {
    const f = historyFixture(); f.instruments.getMapping.mockResolvedValue(undefined);
    expect(await new FillHistory(f.store, f.instruments, f.providers).execute('NSE:TEST', '1m', 0, 100, historySignal()))
      .toEqual({ ok: false, reason: 'UNSUPPORTED' }); expect(f.history).not.toHaveBeenCalled();
  });
  it('continuous ids give UNSUPPORTED with detail', async () => {
    const f = historyFixture();
    expect(await new FillHistory(f.store, f.instruments, f.providers).execute('NSE:NIFTY1!', '1m', 0, 100, historySignal()))
      .toEqual({ ok: false, reason: 'UNSUPPORTED', detail: 'continuous history arrives in P2-8' });
    expect(f.instruments.getMapping).not.toHaveBeenCalled();
  });
  it('returns provider failures without storing or substituting vendors (E3 E4 E6)', async () => {
    const f = historyFixture(); f.history.mockResolvedValue({ ok: false, reason: 'AUTH_EXPIRED' });
    const fill = new FillHistory(f.store, f.instruments, f.providers);
    expect(await fill.execute('NSE:TEST', '1m', 0, 100, historySignal())).toEqual({ ok: false, reason: 'AUTH_EXPIRED' });
    expect(f.store.upsert1m).not.toHaveBeenCalled();
    expect(await fill.execute('NYSE:TEST', '1m', 0, 100, historySignal())).toEqual({ ok: false, reason: 'UNSUPPORTED' });
  });
});
