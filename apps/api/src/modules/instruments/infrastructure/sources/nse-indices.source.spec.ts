import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SourceClient, SourceRegistry, type SourceHealth } from '../../../../shared/sources';
import { expectConformingDescriptors } from '../../../../shared/sources/descriptor-conformance.spec-helper';
import { NSE_INDICES_DESCRIPTOR, NseIndicesSource, parseConstituents } from './nse-indices.source';

const fixture = readFileSync(resolve(__dirname, '__fixtures__/nse-indices/ind_nifty50list.csv'), 'utf8');

function sourceReturning(body: string) {
  const registry = new SourceRegistry({});
  registry.register(NSE_INDICES_DESCRIPTOR);
  const health = { success: vi.fn(() => Promise.resolve()), items: vi.fn(() => Promise.resolve()), failure: vi.fn(() => Promise.resolve()),
    rateLimited: vi.fn(() => Promise.resolve()), read: vi.fn(() => Promise.resolve({})) } satisfies SourceHealth;
  const fetchFn = vi.fn((input: string | URL | Request) => Promise.resolve(Object.assign(new Response(body), { requested: input })));
  const client = new SourceClient(registry, health, () => ({ take: () => Promise.resolve() }), { fetch: fetchFn, sleep: () => Promise.resolve() });
  return { source: new NseIndicesSource(client), health, fetchFn };
}

describe('nse-indices source', () => {
  it('declares a conforming descriptor', () => { expectConformingDescriptors([NSE_INDICES_DESCRIPTOR], 'instruments'); });

  it('parses the fixture to canonical ids, handling quotes, & and -', () => {
    expect(parseConstituents(fixture)).toEqual([
      { id: 'NSE:ADANIENT', name: 'Adani Enterprises Ltd.' }, { id: 'NSE:HDFCBANK', name: 'HDFC Bank Ltd.' }, { id: 'NSE:M&M', name: 'Mahindra & Mahindra Ltd.' },
      { id: 'NSE:BAJAJ-AUTO', name: 'Bajaj Auto Ltd.' }, { id: 'NSE:RELIANCE', name: 'Reliance Industries Ltd.' }, { id: 'NSE:NOSUCHSYM', name: 'Unknown Listing Ltd.' },
    ]);
  });

  it('fetches the index file through the source client and records the item count', async () => {
    const { source, health, fetchFn } = sourceReturning(fixture);
    expect(await source.fetch('nifty100', new AbortController().signal)).toHaveLength(6);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://archives.nseindia.com/content/indices/ind_nifty100list.csv');
    expect(health.items).toHaveBeenCalledWith('nse-indices', 6);
  });

  it('shape changed: an HTML error page, a header-only file and an empty body are errors, never an empty list', async () => {
    expect(() => parseConstituents('<html><body>Access Denied</body></html>')).toThrow('no Company Name / Symbol columns');
    expect(() => parseConstituents('Company Name,Industry,Symbol,Series,ISIN Code\n')).toThrow('no rows');
    expect(() => parseConstituents('')).toThrow();
    await expect(sourceReturning('<html>blocked</html>').source.fetch('nifty50', new AbortController().signal)).rejects.toThrow();
  });
});
