import { describe, expect, it, vi } from 'vitest';
import { FillHistory } from './fill-history';
import { BackfillHeld } from './backfill-held';
import { historyBar, historyFixture, historySignal } from './history.spec-helper';

describe('FR-MD-2 nightly backfill', () => {
  it('reconciles live bars against vendor and marks repaired', async () => {
    const f = historyFixture(); f.store.range1m.mockResolvedValue([{ ...historyBar, close: 9 }]);
    f.store.upsert1m.mockResolvedValue({ written: 1, repaired: 1 });
    const log = { info: vi.fn() }; const now = Date.parse('2026-11-10T19:00:00Z');
    const backfill = new BackfillHeld(new FillHistory(f.store, f.instruments, f.providers), f.instruments, () => now, log);
    expect(await backfill.execute(historySignal())).toEqual({ 'NSE:TEST': { ok: true, data: { written: 2, repaired: 1 } } });
    expect(f.store.upsert1m.mock.calls[0]?.[1]).toEqual([{ ...historyBar, repaired: true }]);
    expect(f.history.mock.calls[0]?.slice(1, 4)).toEqual(['1m', Date.parse('2026-11-04T03:45:00Z'), now]);
    expect(f.history.mock.calls[1]?.slice(1, 4)).toEqual(['1d', now - 400 * 86400000, now]);
    expect(log.info).toHaveBeenCalledWith({ instrumentId: 'NSE:TEST', written: 2, repaired: 1 });
  });
  it('one failing instrument does not stop others', async () => {
    const f = historyFixture(); f.instruments.held.mockResolvedValue(['NSE:BAD', 'NSE:TEST']);
    f.history.mockRejectedValueOnce(new Error('outage'));
    const results = await new BackfillHeld(new FillHistory(f.store, f.instruments, f.providers), f.instruments,
      () => Date.parse('2026-11-10T19:00:00Z'), { info: vi.fn() }).execute(historySignal());
    expect(results['NSE:BAD']).toEqual({ ok: false, reason: 'PROVIDER_DOWN' });
    expect(results['NSE:TEST']).toEqual({ ok: true, data: { written: 2, repaired: 0 } });
  });
});
