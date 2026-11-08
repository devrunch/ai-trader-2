import { afterEach, describe, expect, it, vi } from 'vitest';
import { KiteHistoryProvider } from './kite-history.provider';

const day = 86400000;
const row = { date: '2026-11-09T09:15:00+0530', open: 10, high: 12, low: 9, close: 11, volume: 0 };
function fixture() {
  const client = { setAccessToken: vi.fn(), getHistoricalData: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([row]) };
  const session = { getAccessToken: vi.fn().mockResolvedValue('token') };
  const bucket = { take: vi.fn().mockResolvedValue(undefined) };
  return { client, session, bucket, provider: new KiteHistoryProvider(session, bucket, () => client) };
}
const mapping = { providerSymbol: 'RELIANCE', providerToken: '2885/738561', volumeType: 'real' } satisfies Parameters<KiteHistoryProvider['history']>[0];
const signal = () => new AbortController().signal;
describe('FR-MD-1 FR-MD-4 Kite history', () => {
  afterEach(() => vi.useRealTimers());
  it('chunks minute history at 60 days', async () => {
    const f = fixture(); await f.provider.history(mapping, '1m', 0, 121 * day, signal());
    expect(f.client.getHistoricalData.mock.calls).toEqual([
      [738561, 'minute', '1970-01-01 05:30:00', '1970-03-02 05:29:59'],
      [738561, 'minute', '1970-03-02 05:30:00', '1970-05-01 05:29:59'],
      [738561, 'minute', '1970-05-01 05:30:00', '1970-05-02 05:29:59'],
    ]);
  });
  it('converts IST bar starts to UTC', async () => {
    const f = fixture(); const from = Date.parse('2026-11-09T03:45:00Z');
    expect(await f.provider.history(mapping, '1m', from, from + day, signal())).toEqual({ ok: true,
      data: [{ time: from, open: 10, high: 12, low: 9, close: 11, volume: 0 }] });
  });
  it('index volume 0 becomes null', async () => {
    const f = fixture();
    const result = await f.provider.history({ ...mapping, volumeType: 'none' }, '1d', 0, Date.parse(row.date) + day, signal());
    expect(result).toMatchObject({ ok: true, data: [{ volume: null }] });
  });
  it('recognizes Kite index tokens without optional instrument metadata', async () => {
    const f = fixture();
    expect(await f.provider.history({ providerSymbol: 'NIFTY 50', providerToken: '1001/256265' },
      '1d', 0, Date.parse(row.date) + day, signal())).toMatchObject({ ok: true, data: [{ volume: null }] });
  });
  it('maps TokenException to AUTH_EXPIRED', async () => {
    const f = fixture(); f.client.getHistoricalData.mockRejectedValue({ error_type: 'TokenException' });
    expect(await f.provider.history(mapping, '1m', 0, day, signal())).toEqual({ ok: false, reason: 'AUTH_EXPIRED' });
  });
  it('maps 429 to RATE_LIMITED', async () => {
    const f = fixture(); f.client.getHistoricalData.mockRejectedValue({ status: 429 });
    expect(await f.provider.history(mapping, '1m', 0, day, signal())).toEqual({ ok: false, reason: 'RATE_LIMITED', retryAfterMs: 1000 });
    expect(f.client.getHistoricalData).toHaveBeenCalledOnce();
  });
  it('opens the breaker after 3 failures and returns PROVIDER_DOWN fast', async () => {
    const f = fixture(); f.client.getHistoricalData.mockRejectedValue({ error_type: 'NetworkException' });
    for (let i = 0; i < 3; i++) await f.provider.history(mapping, '1m', 0, day, signal());
    const blocked = await f.provider.history(mapping, '1m', 0, day, signal());
    expect(blocked).toMatchObject({ ok: false, reason: 'PROVIDER_DOWN' });
    if (blocked.ok) throw new Error('Expected open breaker');
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(f.client.getHistoricalData).toHaveBeenCalledTimes(3); expect(f.bucket.take).toHaveBeenCalledTimes(3);
  });
  it('NO_DATA does not trip the breaker', async () => {
    const f = fixture(); f.client.getHistoricalData.mockResolvedValue([]);
    for (let i = 0; i < 5; i++) expect(await f.provider.history(mapping, '1m', 0, day, signal())).toEqual({ ok: false, reason: 'NO_DATA' });
    expect(f.client.getHistoricalData).toHaveBeenCalledTimes(5);
  });
  it('takes a rate token per chunk', async () => {
    const f = fixture(); await f.provider.history(mapping, '1d', 0, 4001 * day, signal()); expect(f.bucket.take).toHaveBeenCalledTimes(3);
  });
  it('times out a hung request after 15 seconds (E6)', async () => {
    vi.useFakeTimers(); const f = fixture(); f.client.getHistoricalData.mockReturnValue(new Promise(() => {}));
    const pending = f.provider.history(mapping, '1m', 0, day, signal());
    await vi.advanceTimersByTimeAsync(15000);
    expect(await pending).toEqual({ ok: false, reason: 'PROVIDER_DOWN' });
  });
  it('honours caller cancellation during a request', async () => {
    const f = fixture(); const controller = new AbortController();
    f.client.getHistoricalData.mockImplementation(() => { controller.abort(); return new Promise(() => {}); });
    await expect(f.provider.history(mapping, '1m', 0, day, controller.signal)).rejects.toThrow();
  });
  it('unknown instrument errors do not trip the breaker', async () => {
    const f = fixture(); f.client.getHistoricalData.mockRejectedValue({ error_type: 'InputException', message: 'Unknown instrument' });
    for (let i = 0; i < 5; i++) expect(await f.provider.history(mapping, '1m', 0, day, signal())).toEqual({ ok: false, reason: 'UNSUPPORTED' });
    expect(f.client.getHistoricalData).toHaveBeenCalledTimes(5);
  });
  it('maps Too many network errors to RATE_LIMITED without retrying (E4)', async () => {
    const f = fixture(); f.client.getHistoricalData.mockRejectedValue({ error_type: 'NetworkException', message: 'Too many requests' });
    expect(await f.provider.history(mapping, '1m', 0, day, signal())).toEqual({ ok: false, reason: 'RATE_LIMITED', retryAfterMs: 1000 });
    expect(f.bucket.take).toHaveBeenCalledOnce();
  });
  it('rejects missing mapping tokens before accessing Kite', async () => {
    const f = fixture();
    expect(await f.provider.history({ providerSymbol: 'TEST' }, '1m', 0, day, signal())).toEqual({ ok: false, reason: 'UNSUPPORTED' });
    expect(f.session.getAccessToken).not.toHaveBeenCalled();
  });
});
