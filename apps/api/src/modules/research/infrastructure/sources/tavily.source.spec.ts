import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectConformingDescriptors } from '../../../../shared/sources/descriptor-conformance.spec-helper';
import { clientReturning } from '../../../../shared/sources/source-test-client.spec-helper';
import { TAVILY_DESCRIPTOR, TavilySource } from './tavily.source';

const signal = new AbortController().signal;

describe('tavily source', () => {
  it('declares a conforming descriptor', () => { expectConformingDescriptors([TAVILY_DESCRIPTOR], 'research'); });
  it('parses results into cited snippets and drops non-http links', async () => {
    const body = readFileSync(join(__dirname, '__fixtures__', 'tavily', 'search.json'), 'utf8');
    const { client, fetchFn } = clientReturning([TAVILY_DESCRIPTOR], body, { TAVILY_API_KEY: 'k' });
    expect(await new TavilySource('k', client).search('RBI policy', 5, signal)).toEqual([{ title: 'RBI holds repo rate', url: 'https://example.test/rbi', snippet: 'The Reserve Bank kept the rate. Unchanged at 6.5%.' }]);
    const sent = fetchFn.mock.calls[0]?.[1]?.body;
    expect(JSON.parse(typeof sent === 'string' ? sent : '')).toMatchObject({ query: 'RBI policy', max_results: 5 });
  });
  it('fails when the response changes shape', async () => {
    await expect(new TavilySource('k', clientReturning([TAVILY_DESCRIPTOR], '{"detail":"unauthorized"}', { TAVILY_API_KEY: 'k' }).client).search('x', 5, signal)).rejects.toThrow();
  });
});
