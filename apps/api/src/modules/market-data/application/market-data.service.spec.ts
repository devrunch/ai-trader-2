import { expect, it } from 'vitest';
import { MarketDataService } from './market-data.service';
import { marketFixture, quoteBar } from './market-data.spec-helper';

function fixture(id?: string) { const f = marketFixture(id); return { ...f, service: new MarketDataService(f.resolve, f.read, f.feeds) }; }
it('continuous id reads the resolved contract and reports resolvedId (FR-SY-5, FR-CH-5)', async () => {
  const f = fixture('MCX:GOLD27JANFUT');
  const result = await f.service.bars('MCX:GOLD1!', '1', { before: 100 }, 42);
  expect(result.resolvedId).toBe('MCX:GOLD27JANFUT'); expect(result.instrumentId).toBe('MCX:GOLD1!');
  expect(f.read.execute).toHaveBeenCalledWith('MCX:GOLD27JANFUT', '1', { before: 100 }, 42, expect.any(AbortSignal));
});
it('us instruments report delayed 15 minutes (FR-UI-8)', async () => {
  const f = fixture('NASDAQ:AAPL'); expect((await f.service.bars('NASDAQ:AAPL', '1', { latest: true }, 500)).status).toEqual({ state: 'delayed', delayMs: 900000 });
});
it('a stale feed state marks the response stale with its reason (FR-UI-7)', async () => {
  const f = fixture(); f.feeds.get.mockResolvedValue({ state: 'stale', reason: 'AUTH_EXPIRED', at: 1 });
  expect((await f.service.bars('NSE:TEST', '1', { latest: true }, 500)).status).toEqual({ state: 'stale', reason: 'AUTH_EXPIRED' });
  expect(f.feeds.get).toHaveBeenCalledWith('kite', expect.any(AbortSignal));
});
it('auth expired with no bars returns 503 with reason, never another vendor (E3)', async () => {
  const f = fixture(); f.read.execute.mockResolvedValue({ ok: false, reason: 'AUTH_EXPIRED' });
  await expect(f.service.bars('NSE:TEST', '1', { latest: true }, 500)).rejects.toMatchObject({ httpStatus: 503, code: 'PROVIDER_DOWN', details: { reason: 'AUTH_EXPIRED' } });
  expect(f.read.execute).toHaveBeenCalledTimes(1); expect(f.read.execute.mock.calls[0]?.[0]).toBe('NSE:TEST');
});
it('open breaker with cached bars returns them with stale PROVIDER_DOWN (E6)', async () => {
  const f = fixture(); f.read.execute.mockResolvedValue({ bars: [quoteBar], nextBefore: null, complete: false, status: { ok: false, reason: 'PROVIDER_DOWN' } });
  expect(await f.service.bars('NSE:TEST', '1', { latest: true }, 500)).toMatchObject({ bars: [quoteBar], status: { state: 'stale', reason: 'PROVIDER_DOWN' } });
});
it('market closed with no bars returns 200 empty with reason (FR-MD-1)', async () => {
  const f = fixture(); f.read.execute.mockResolvedValue({ ok: false, reason: 'MARKET_CLOSED' });
  expect(await f.service.bars('NSE:TEST', '1', { latest: true }, 500)).toMatchObject({ bars: [], nextBefore: null, status: { state: 'stale', reason: 'MARKET_CLOSED' } });
});
it.each([['PROVIDER_DOWN', 503, 'PROVIDER_DOWN'], ['RATE_LIMITED', 429, 'RATE_LIMITED'], ['UNSUPPORTED', 422, 'VALIDATION_FAILED']] as const)('maps %s to a typed error (FR-MD-1)', async (reason, httpStatus, code) => {
  const f = fixture(); f.read.execute.mockResolvedValue({ ok: false, reason, retryAfterMs: 2000 });
  await expect(f.service.bars('NSE:TEST', '1', { latest: true }, 500)).rejects.toMatchObject({ httpStatus, code, details: { reason } });
});
