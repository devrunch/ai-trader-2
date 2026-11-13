import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SourceClient, SourceRegistry, type SourceHealth } from '../../../shared/sources';
import { TWELVE_DATA_EARNINGS_DESCRIPTOR, TwelveDataEarningsSource } from './twelve-data-earnings.source';

function clientFor(body: string, env: Record<string, string> = { TWELVE_DATA_API_KEY: 'k' }) {
  const registry = new SourceRegistry(env);
  registry.register(TWELVE_DATA_EARNINGS_DESCRIPTOR);
  const health = { success: vi.fn(() => Promise.resolve()), items: vi.fn(() => Promise.resolve()), failure: vi.fn(() => Promise.resolve()),
    rateLimited: vi.fn(() => Promise.resolve()), read: vi.fn(() => Promise.resolve({})) } satisfies SourceHealth;
  const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(body)));
  return { client: new SourceClient(registry, health, () => ({ take: () => Promise.resolve() }), { fetch: fetchFn, sleep: () => Promise.resolve() }), health, fetchFn };
}
const signal = new AbortController().signal;
const body = readFileSync(join(__dirname, '__fixtures__', 'twelve-data-earnings', 'earnings_calendar.json'), 'utf8');
const universe = { members: vi.fn(() => Promise.resolve(['NASDAQ:NVDA', 'NYSE:HD', 'NYSE:BRK.B'].map(symbol => ({ symbol })))) };
const now = Date.parse('2026-11-13T12:00:00Z');
const sourceFor = (client: SourceClient, key: string | undefined) => new TwelveDataEarningsSource(client, key, universe, () => now, 14);

describe('Twelve Data earnings calendar', () => {
  it('keeps universe members only, in one batched request with the key in a header, and times them in ET', async () => {
    const { client, health, fetchFn } = clientFor(body);
    const events = await sourceFor(client, 'k').fetch(signal);
    expect(events).toEqual([
      { title: 'HD earnings', country: 'USD', at: '2026-11-17T13:00:00.000Z', impact: 'High', forecast: 'EPS 3.64', previous: null },
      { title: 'NVDA earnings', country: 'USD', at: '2026-11-19T21:30:00.000Z', impact: 'High', forecast: 'EPS 0.75', previous: null },
      { title: 'BRK.B earnings', country: 'USD', at: '2026-11-19T21:00:00.000Z', impact: 'High', forecast: null, previous: null },
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://api.twelvedata.com/earnings_calendar?start_date=2026-11-13&end_date=2026-11-27&country=United+States');
    expect(init?.headers).toMatchObject({ authorization: 'apikey k' });
    expect(health.items).toHaveBeenCalledWith('twelve-data-earnings', 3);
  });

  it('marks members beyond the 15 largest Medium', async () => {
    const many = { members: () => Promise.resolve([...Array.from({ length: 15 }, (_, i) => ({ symbol: `NYSE:X${String(i)}` })), { symbol: 'NYSE:HD' }]) };
    const { client } = clientFor(body);
    const events = await new TwelveDataEarningsSource(client, 'k', many, () => now).fetch(signal);
    expect(events.map(e => [e.title, e.impact])).toEqual([['HD earnings', 'Medium']]);
  });

  it('is off without a key: no request and no events', async () => {
    const { client, fetchFn } = clientFor(body, {});
    expect(await sourceFor(client, undefined).fetch(signal)).toEqual([]);
    expect(await sourceFor(client, '  ').fetch(signal)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails when the response changes shape or is an error body', async () => {
    for (const bad of [JSON.stringify({ data: [] }), JSON.stringify({ code: 403, message: 'plan', status: 'error' })]) {
      const { client, health } = clientFor(bad);
      await expect(sourceFor(client, 'k').fetch(signal)).rejects.toThrow();
      expect(health.items).not.toHaveBeenCalled();
    }
  });
});
