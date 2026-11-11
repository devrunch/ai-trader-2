import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForexFactorySource } from './forex-factory.source';

afterEach(() => { vi.unstubAllGlobals(); });

describe('ForexFactory calendar feed', () => {
  it('reads this week, tolerates next week not being published yet, and keeps the offset time as UTC', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(url.endsWith('thisweek.json')
      ? new Response(JSON.stringify([
        { title: 'CPI y/y ', country: 'usd', date: '2026-11-12T08:30:00-05:00', impact: 'High', forecast: '3.1%', previous: '' },
        { title: 'Bank Holiday', country: 'JPY', date: '2026-11-13T00:00:00-05:00', impact: 'Holiday' },
        { title: 'Odd', country: 'EUR', date: 'not a date', impact: 'High' },
        { title: 'Unknown impact', country: 'EUR', date: '2026-11-12T08:30:00-05:00', impact: 'Non-Economic' }]))
      : new Response('missing', { status: 404 }))));
    expect(await new ForexFactorySource().fetch(new AbortController().signal)).toEqual([
      { title: 'CPI y/y', country: 'USD', at: '2026-11-12T13:30:00.000Z', impact: 'High', forecast: '3.1%', previous: null },
      { title: 'Bank Holiday', country: 'JPY', at: '2026-11-13T05:00:00.000Z', impact: 'Holiday', forecast: null, previous: null },
    ]);
  });
});
