import { describe, expect, it } from 'vitest';
import { buildUniverseTools } from './universe-tools';

const ctx = { userId: 'u1', conversationId: '7d9f0a2e-0000-4000-8000-000000000001', turnId: 'turn-abcdef12' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };
const many = Array.from({ length: 130 }, (_, i) => ({ symbol: `NSE:S${String(i)}`, name: i % 2 ? null : `S${String(i)} Ltd` }));
const universes = {
  list: () => Promise.resolve([{ id: 'nifty50' as const, name: 'NIFTY 50', count: 50, note: null }, { id: 'nifty500' as const, name: 'NIFTY 500', count: 130, note: '2 of 132 dropped' }]),
  members: (id: string, userId: string) => Promise.resolve(id === 'nifty500' ? many : userId === 'u1' ? many.slice(0, 2) : []),
};
const tool = () => buildUniverseTools(universes, deps)[0];

describe('listUniverse tool', () => {
  it('without an argument lists the universes with counts and the source', async () => {
    expect(await tool()?.call(ctx, {})).toEqual({ ok: true, data: { source: 'nse-indices, curated lists, instrument master',
      universes: [{ id: 'nifty50', name: 'NIFTY 50', count: 50, note: null }, { id: 'nifty500', name: 'NIFTY 500', count: 130, note: '2 of 132 dropped' }] } });
  });
  it('with a universe returns members capped at 100 with the total', async () => {
    const result = await tool()?.call(ctx, { universe: 'nifty500' });
    expect(result).toMatchObject({ ok: true, data: { universe: 'nifty500', total: 130, shown: 100, truncated: true } });
    expect(result?.ok && 'members' in (result.data as object) && (result.data as { members: unknown[] }).members).toHaveLength(100);
  });
  it('passes the caller as user for the watchlist and rejects unknown universes', async () => {
    expect(await tool()?.call(ctx, { universe: 'watchlist' })).toMatchObject({ ok: true, data: { total: 2, truncated: false } });
    expect(await tool()?.call(ctx, { universe: 'nope' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
});
