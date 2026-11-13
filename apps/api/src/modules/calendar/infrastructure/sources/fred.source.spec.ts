import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SourceClient, SourceRegistry, type SourceHealth } from '../../../../shared/sources';
import type { EventRef } from '../../application/ports/actuals-source';
import { FRED_DESCRIPTOR, FredActuals } from './fred.source';

const fixture = (name: string): string => readFileSync(join(__dirname, '__fixtures__', 'fred', name), 'utf8');
const urlOf = (input: string | URL | Request): string => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const signal = new AbortController().signal;
const cpi: EventRef = { id: 'cpi', title: 'CPI m/m', country: 'USD', at: '2026-11-12T13:30:00.000Z', forecast: '0.3%', previous: '0.2%' };

function setup(body: string, key: string | undefined) {
  const registry = new SourceRegistry({ FRED_API_KEY: key });
  registry.register(FRED_DESCRIPTOR);
  const health = { success: vi.fn(() => Promise.resolve()), items: vi.fn(() => Promise.resolve()), failure: vi.fn(() => Promise.resolve()),
    rateLimited: vi.fn(() => Promise.resolve()), read: vi.fn(() => Promise.resolve({})) } satisfies SourceHealth;
  const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(body)));
  const client = new SourceClient(registry, health, () => ({ take: () => Promise.resolve() }), { fetch: fetchFn, sleep: () => Promise.resolve() });
  return { source: new FredActuals(client, key), fetchFn, health };
}

describe('FRED actuals', () => {
  it('turns the index observations of the reference month into the m/m figure and asks only for that window', async () => {
    const { source, fetchFn, health } = setup(fixture('observations-cpiaucsl.json'), 'k');
    expect(await source.fetch([cpi, { ...cpi, id: 'other', title: 'Beige Book' }, { ...cpi, id: 'eur', country: 'EUR' }], signal)).toEqual([{ eventId: 'cpi', actual: '0.3%', source: 'fred' }]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL(urlOf(fetchFn.mock.calls[0]?.[0] ?? ''));
    expect(url.searchParams.get('series_id')).toBe('CPIAUCSL');
    expect([url.searchParams.get('observation_start'), url.searchParams.get('observation_end')]).toEqual(['2026-09-01', '2026-10-01']);
    expect(health.items).toHaveBeenCalledWith('fred', 1);
  });

  it('reports nothing while the period is still unpublished (last month is not today\'s actual)', async () => {
    const payrolls: EventRef = { ...cpi, id: 'nfp', title: 'Non-Farm Employment Change', at: '2026-12-04T13:30:00.000Z' };
    const { source, health } = setup(fixture('observations-payems-unpublished.json'), 'k');
    expect(await source.fetch([payrolls], signal)).toEqual([]);
    expect(health.failure).not.toHaveBeenCalled();
    const stale = setup(JSON.stringify({ observations: [{ date: '2026-09-01', value: '321.4' }] }), 'k');
    expect(await stale.source.fetch([cpi], signal)).toEqual([]);
  });

  it('is off without a key: no request, no error', async () => {
    const { source, fetchFn } = setup('{}', undefined);
    expect(await source.fetch([cpi], signal)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails loudly when the response shape changed', async () => {
    const { source } = setup('{"error_code":400,"error_message":"Bad Request"}', 'k');
    await expect(source.fetch([cpi], signal)).rejects.toThrow();
  });

  it('declares the key it needs', () => { expect(FRED_DESCRIPTOR.envKeys).toEqual(['FRED_API_KEY']); });
});
