import { afterEach, describe, expect, it, vi } from 'vitest';
import { DerivHistoryProvider } from './deriv-history.provider';

describe('FR-MD-1 E6 Deriv history', () => {
  const mapping = { providerSymbol: 'frxEURUSD' }; const signal = () => new AbortController().signal;
  afterEach(() => { vi.useRealTimers(); });
  it('times out history at fifteen seconds', async () => {
    vi.useFakeTimers();
    const request = vi.fn<() => Promise<unknown>>().mockImplementation(() => new Promise(() => {}));
    const pending = new DerivHistoryProvider({ request }).history(mapping, '1m', 0, 60000, signal());
    await vi.advanceTimersByTimeAsync(15000);
    expect(await pending).toEqual({ ok: false, reason: 'PROVIDER_DOWN' });
  });
  it('probes the breaker after sixty seconds (E6)', async () => {
    vi.useFakeTimers(); const request = vi.fn().mockRejectedValue(new Error('offline')); const provider = new DerivHistoryProvider({ request });
    for (let i = 0; i < 3; i++) await provider.history(mapping, '1m', 0, 60000, signal());
    await vi.advanceTimersByTimeAsync(60000); request.mockResolvedValue({ candles: [] });
    expect(await provider.history(mapping, '1m', 0, 60000, signal())).toEqual({ ok: false, reason: 'NO_DATA' }); expect(request).toHaveBeenCalledTimes(4);
  });
  it('pages backwards with count 1000 and never sends start', async () => {
    const candle = (epoch: number) => ({ epoch, open: 1, high: 2, low: 1, close: 2 });
    const request = vi.fn<(command: { end: number; count: number }, signal: AbortSignal) => Promise<unknown>>()
      .mockResolvedValueOnce({ candles: [candle(120000), candle(179940), candle(180000)] })
      .mockResolvedValueOnce({ candles: [candle(119940), candle(59940), candle(60000)] });
    const result = await new DerivHistoryProvider({ request }).history(mapping, '1m', 60000000, 180000000, signal());
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(call => call[0])).toEqual([
      { ticks_history: 'frxEURUSD', style: 'candles', granularity: 60, end: 179999, count: 1000, req_id: 1 },
      { ticks_history: 'frxEURUSD', style: 'candles', granularity: 60, end: 119940, count: 1000, req_id: 2 },
    ]);
    expect(result).toEqual({ ok: true, data: [60000, 119940, 120000, 179940].map(epoch => ({ time: epoch * 1000, open: 1, high: 2, low: 1, close: 2, volume: null })) });
  });
  it('stops after a closed-market gap and returns NO_DATA for a closed window', async () => {
    const request = vi.fn().mockResolvedValue({ candles: [] });
    const from = Date.parse('2026-11-14T12:00:00Z');
    expect(await new DerivHistoryProvider({ request }).history(mapping, '1m', from, from + 3600000, signal())).toEqual({ ok: false, reason: 'NO_DATA' });
    expect(request).toHaveBeenCalledOnce();
  });
  it('crosses empty weekend pages to reach the requested open session', async () => {
    const from = Date.parse('2026-11-13T21:00:00Z'); const to = Date.parse('2026-11-15T21:00:00Z');
    const request = vi.fn().mockResolvedValueOnce({ candles: [] }).mockResolvedValueOnce({ candles: [] })
      .mockResolvedValueOnce({ candles: [{ epoch: from / 1000, open: 1, high: 2, low: 1, close: 2 }] });
    const result = await new DerivHistoryProvider({ request }).history(mapping, '1m', from, to, signal());
    expect(request).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ ok: true, data: [{ time: from, open: 1, high: 2, low: 1, close: 2, volume: null }] });
  });
  it('caps backwards paging at twenty requests', async () => {
    const request = vi.fn().mockResolvedValue({ candles: [] });
    expect(await new DerivHistoryProvider({ request }).history(mapping, '1m', 0, 30 * 86400000, signal())).toEqual({ ok: false, reason: 'NO_DATA' });
    expect(request).toHaveBeenCalledTimes(20);
  });
  it('maps MarketIsClosed to MARKET_CLOSED', async () => {
    const request = vi.fn().mockResolvedValue({ error: { code: 'MarketIsClosed', message: 'closed' } });
    expect(await new DerivHistoryProvider({ request }).history(mapping, '1m', 0, 60000, signal())).toEqual({ ok: false, reason: 'MARKET_CLOSED' });
  });
  it('empty history is NO_DATA', async () => {
    expect(await new DerivHistoryProvider({ request: vi.fn().mockResolvedValue({ candles: [] }) }).history(mapping, '1d', 0, 86400000, signal())).toEqual({ ok: false, reason: 'NO_DATA' });
  });
  it('breaker opens after 3 failures', async () => {
    const request = vi.fn().mockRejectedValue(new Error('offline')); const provider = new DerivHistoryProvider({ request });
    for (let i = 0; i < 4; i++) expect(await provider.history(mapping, '1m', 0, 60000, signal())).toEqual({ ok: false, reason: 'PROVIDER_DOWN' });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
