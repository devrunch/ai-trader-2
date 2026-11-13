import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SourceClient, SourceRegistry, type SourceHealth } from '../../../shared/sources';
import { FF_WEEKLY_DESCRIPTOR, ForexFactorySource } from './forex-factory.source';

function clientFor(respond: (url: string) => Response) {
  const registry = new SourceRegistry({});
  registry.register(FF_WEEKLY_DESCRIPTOR);
  const health = { success: vi.fn(() => Promise.resolve()), items: vi.fn(() => Promise.resolve()), failure: vi.fn(() => Promise.resolve()),
    rateLimited: vi.fn(() => Promise.resolve()), read: vi.fn(() => Promise.resolve({})) } satisfies SourceHealth;
  const fetchFn = vi.fn<typeof fetch>(input => Promise.resolve(respond(input instanceof Request ? input.url : input.toString())));
  return { client: new SourceClient(registry, health, () => ({ take: () => Promise.resolve() }), { fetch: fetchFn, sleep: () => Promise.resolve() }), health, fetchFn };
}
const signal = new AbortController().signal;
const isThisWeek = (url: string): boolean => url.endsWith('thisweek.json');

describe('ForexFactory calendar feed', () => {
  it('reads this week, tolerates next week not being published yet, and keeps the offset time as UTC', async () => {
    const { client, health } = clientFor(url => (isThisWeek(url)
      ? new Response(JSON.stringify([
        { title: 'CPI y/y ', country: 'usd', date: '2026-11-12T08:30:00-05:00', impact: 'High', forecast: '3.1%', previous: '' },
        { title: 'Bank Holiday', country: 'JPY', date: '2026-11-13T00:00:00-05:00', impact: 'Holiday' },
        { title: 'Odd', country: 'EUR', date: 'not a date', impact: 'High' },
        { title: 'Unknown impact', country: 'EUR', date: '2026-11-12T08:30:00-05:00', impact: 'Non-Economic' }]))
      : new Response('missing', { status: 404 })));
    expect(await new ForexFactorySource(client).fetch(signal)).toEqual([
      { title: 'CPI y/y', country: 'USD', at: '2026-11-12T13:30:00.000Z', impact: 'High', forecast: '3.1%', previous: null },
      { title: 'Bank Holiday', country: 'JPY', at: '2026-11-13T05:00:00.000Z', impact: 'Holiday', forecast: null, previous: null },
    ]);
    expect(health.items).toHaveBeenCalledWith('ff-weekly', 2);
    expect(health.failure).not.toHaveBeenCalled();
  });

  it('parses the recorded weekly file', async () => {
    const body = readFileSync(join(__dirname, '__fixtures__', 'ff-weekly', 'thisweek.json'), 'utf8');
    const { client } = clientFor(url => (isThisWeek(url) ? new Response(body) : new Response('', { status: 404 })));
    const events = await new ForexFactorySource(client).fetch(signal);
    expect(events).toHaveLength(6);
    expect(events[0]).toMatchObject({ title: 'RBA Assist Gov Hunter Speaks', country: 'AUD', impact: 'Low', forecast: null });
  });

  it('fails when the feed changes shape', async () => {
    const { client, health } = clientFor(() => new Response(JSON.stringify({ events: [] })));
    await expect(new ForexFactorySource(client).fetch(signal)).rejects.toThrow();
    expect(health.items).not.toHaveBeenCalled();
  });

  it('fails when this week is missing, since only next week may be absent', async () => {
    const { client } = clientFor(() => new Response('gone', { status: 404 }));
    await expect(new ForexFactorySource(client).fetch(signal)).rejects.toThrow('HTTP 404');
  });
});
