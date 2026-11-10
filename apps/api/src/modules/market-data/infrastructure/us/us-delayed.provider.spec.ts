import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsDelayedProvider } from './us-delayed.provider';

describe('FR-MD-1 E6 US delayed history', () => {
  const now = Date.parse('2026-11-09T16:00:00Z'); const signal = () => new AbortController().signal;
  afterEach(() => { vi.useRealTimers(); });
  it('maps the library numeric HTTP error code to RATE_LIMITED', async () => {
    const chart = vi.fn().mockRejectedValue(Object.assign(new Error('Too Many Requests'), { code: 429 }));
    expect(await new UsDelayedProvider({ chart }, () => now).history({ providerSymbol: 'AAPL' }, '1d', 0, now, signal())).toEqual({ ok: false, reason: 'RATE_LIMITED', retryAfterMs: 60000 });
  });
  it('chunks minute history into at most seven days', async () => {
    const chart = vi.fn().mockResolvedValue({ quotes: [] });
    await new UsDelayedProvider({ chart }, () => now).history({ providerSymbol: 'AAPL' }, '1m', now - 15 * 86400000, now, signal());
    expect(chart).toHaveBeenCalledTimes(3);
    expect(chart).toHaveBeenNthCalledWith(1, 'AAPL', { interval: '1m', period1: new Date(now - 15 * 86400000), period2: new Date(now - 8 * 86400000) }, expect.anything());
    expect(chart).toHaveBeenNthCalledWith(3, 'AAPL', { interval: '1m', period1: new Date(now - 86400000), period2: new Date(now) }, expect.anything());
  });
  it('a minute request older than Yahoo keeps is clamped to the last 30 days, not refused', async () => {
    const chart = vi.fn().mockResolvedValue({ quotes: [{ date: new Date(now - 86400000), open: 1, high: 1, low: 1, close: 1, volume: 1 }] });
    const result = await new UsDelayedProvider({ chart }, () => now).history({ providerSymbol: 'AAPL' }, '1m', now - 77 * 86400000, now, signal());
    expect(result.ok).toBe(true);
    const firstFrom = (chart.mock.calls[0]?.[1] as { period1: Date }).period1.getTime();
    expect(firstFrom).toBeGreaterThanOrEqual(now - 30 * 86400000);
  });
  it('opens after three server failures and probes after five minutes (E6)', async () => {
    let clock = now; const chart = vi.fn().mockRejectedValue({ code: 503 }); const provider = new UsDelayedProvider({ chart }, () => clock);
    for (let i = 0; i < 4; i++) expect(await provider.history({ providerSymbol: 'AAPL' }, '1d', 0, now, signal())).toEqual({ ok: false, reason: 'PROVIDER_DOWN' });
    expect(chart).toHaveBeenCalledTimes(3); clock += 300000; chart.mockResolvedValue({ quotes: [] });
    expect(await provider.history({ providerSymbol: 'AAPL' }, '1d', 0, now, signal())).toEqual({ ok: false, reason: 'NO_DATA' }); expect(chart).toHaveBeenCalledTimes(4);
  });
  it('aborts a pending request at fifteen seconds', async () => {
    vi.useFakeTimers(); const chart = vi.fn<(...args: unknown[]) => Promise<unknown>>().mockImplementation(() => new Promise(() => {}));
    const pending = new UsDelayedProvider({ chart }, () => now).history({ providerSymbol: 'AAPL' }, '1d', 0, now, signal());
    await vi.advanceTimersByTimeAsync(15000); expect(await pending).toEqual({ ok: false, reason: 'PROVIDER_DOWN' });
  });
  it('maps BRK.B to BRK-B', async () => {
    const chart = vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ quotes: [{ date: new Date(now - 60000), open: 1, high: 2, low: 1, close: 2, volume: 10 }] });
    expect(await new UsDelayedProvider({ chart }, () => now).history({ providerSymbol: 'BRK.B' }, '1m', now - 60000, now, signal())).toEqual({ ok: true, data: [{ time: now - 60000, open: 1, high: 2, low: 1, close: 2, volume: 10 }] });
    expect(chart.mock.calls[0]?.slice(0, 2)).toEqual(['BRK-B', { interval: '1m', period1: new Date(now - 60000), period2: new Date(now) }]);
    expect(chart.mock.calls[0]?.[2]).toHaveProperty('fetchOptions.signal');
  });
  it('a 1m range entirely older than 30 days is NO_DATA with detail, without calling Yahoo', async () => {
    const chart = vi.fn();
    expect(await new UsDelayedProvider({ chart }, () => now).history({ providerSymbol: 'AAPL' }, '1m', now - 40 * 86400000, now - 31 * 86400000, signal())).toEqual({ ok: false, reason: 'NO_DATA', detail: 'yahoo keeps 30 days of 1m' });
    expect(chart).not.toHaveBeenCalled();
  });
  it('429 maps to RATE_LIMITED', async () => {
    const chart = vi.fn().mockRejectedValue({ status: 429 });
    expect(await new UsDelayedProvider({ chart }, () => now).history({ providerSymbol: 'AAPL' }, '1d', now - 86400000, now, signal())).toEqual({ ok: false, reason: 'RATE_LIMITED', retryAfterMs: 60000 });
  });
  it('unknown symbol is UNSUPPORTED', async () => {
    const chart = vi.fn().mockRejectedValue({ code: 'Not Found' });
    expect(await new UsDelayedProvider({ chart }, () => now).history({ providerSymbol: 'BAD' }, '1d', now - 86400000, now, signal())).toEqual({ ok: false, reason: 'UNSUPPORTED' });
  });
});
