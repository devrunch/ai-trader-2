import { describe, expect, it, vi } from 'vitest';
import { fetchPineSource, PINE_FETCH_LIMITS } from './pine-source';

const text = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' }, ...init });
const URL_OK = 'https://gist.githubusercontent.com/u/abc/raw/ema.pine';

describe('fetchPineSource (E-links)', () => {
  it('returns plain-text source from an https link', async () => {
    const fetchFn = vi.fn().mockResolvedValue(text('plot(close)'));
    expect(await fetchPineSource(URL_OK, fetchFn)).toBe('plot(close)');
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('refuses non-https, private hosts and credentials without fetching', async () => {
    const fetchFn = vi.fn();
    for (const link of ['http://gist.githubusercontent.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://intranet/x', 'https://u:p@example.com/x']) {
      await expect(fetchPineSource(link, fetchFn)).rejects.toThrow('public https');
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses a body that is not plain text', async () => {
    const html = new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
    await expect(fetchPineSource(URL_OK, vi.fn().mockResolvedValue(html))).rejects.toThrow('not plain text');
  });

  it('refuses more than 200 KB, by declared length and by streamed bytes', async () => {
    const big = 'x'.repeat(PINE_FETCH_LIMITS.maxBytes + 1);
    await expect(fetchPineSource(URL_OK, vi.fn().mockResolvedValue(text(big)))).rejects.toThrow('200 KB');
    const declared = text('x', { headers: { 'content-type': 'text/plain', 'content-length': String(PINE_FETCH_LIMITS.maxBytes + 1) } });
    await expect(fetchPineSource(URL_OK, vi.fn().mockResolvedValue(declared))).rejects.toThrow('200 KB');
  });

  it('gives up when the server does not answer within the timeout', async () => {
    vi.useFakeTimers();
    try {
      const hang = (_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => { init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')); }); });
      const result = expect(fetchPineSource(URL_OK, hang as typeof fetch)).rejects.toThrow('in time');
      await vi.advanceTimersByTimeAsync(PINE_FETCH_LIMITS.timeoutMs + 1);
      await result;
    } finally { vi.useRealTimers(); }
  });

  it('follows a redirect only to another public https link, and stops after three', async () => {
    const hop = (to: string) => new Response(null, { status: 302, headers: { location: to } });
    const ok = vi.fn().mockResolvedValueOnce(hop('https://raw.githubusercontent.com/u/ema.pine')).mockResolvedValueOnce(text('plot(close)'));
    expect(await fetchPineSource(URL_OK, ok)).toBe('plot(close)');
    await expect(fetchPineSource(URL_OK, vi.fn().mockResolvedValue(hop('http://10.0.0.1/x')))).rejects.toThrow('public https');
    await expect(fetchPineSource(URL_OK, vi.fn().mockImplementation(() => Promise.resolve(hop('https://a.example.com/x'))))).rejects.toThrow('too many');
  });
});
