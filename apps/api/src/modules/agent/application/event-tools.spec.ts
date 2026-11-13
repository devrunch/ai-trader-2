import { describe, expect, it, vi } from 'vitest';
import type { EventScorecard } from '@aitrader/contracts';
import { buildEventScorecardTools } from './event-tools';

const ctx = { userId: 'u1', conversationId: '7d9f0a2e-0000-4000-8000-000000000001', turnId: 'turn-abcdef12' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };
const card: EventScorecard = {
  title: 'CPI m/m', country: 'USD',
  spec: { measures: 'Consumer prices', usualEffect: 'Higher CPI lifts USD', why: 'rates', notes: '', source: 'vendored', beat: 'higher-better' },
  releases: [{ eventId: 'e1', at: '2026-10-14T12:30:00.000Z', forecast: '0.3%', previous: '0.2%', actual: '0.4%', surprise: 0.1, surpriseZ: 1.2,
    reactions: [{ symbol: 'FX:USDINR', refPrice: 83, move5Pct: 0.05, move15Pct: 0.12, move60Pct: null }] }],
  stats: [{ symbol: 'FX:USDINR', n: 1, avgAbsMove15Pct: 0.12, avgMove15WhenBeatPct: 0.12, avgMove15WhenMissPct: null, followedSurprisePct: 100 }],
};
const setup = (result: EventScorecard | null) => {
  const get = vi.fn<(q: { title: string; country?: string | undefined; limit: number; asOf?: number | undefined }) => Promise<EventScorecard | null>>(() => Promise.resolve(result));
  return { get, tool: buildEventScorecardTools({ get }, deps)[0] };
};

describe('getEventScorecard tool', () => {
  it('returns releases with moves at 5/15/60 minutes, the stats, the spec and the source, default limit 8', async () => {
    const { get, tool } = setup(card);
    expect(await tool?.call(ctx, { title: 'cpi', country: 'USD' })).toEqual({ ok: true, data: { available: true, source: 'calendar history', title: 'CPI m/m', country: 'USD', spec: card.spec,
      releases: [{ at: '2026-10-14T12:30:00.000Z', forecast: '0.3%', previous: '0.2%', actual: '0.4%', surprise: 0.1, surpriseZ: 1.2,
        moves: [{ symbol: 'FX:USDINR', move5Pct: 0.05, move15Pct: 0.12, move60Pct: null }] }], stats: card.stats } });
    expect(get).toHaveBeenCalledWith({ title: 'cpi', country: 'USD', limit: 8, asOf: undefined });
  });

  it('passes asOf through for replays and rejects a limit above 20', async () => {
    const { get, tool } = setup(card);
    await tool?.call(ctx, { title: 'CPI', limit: 20, asOf: '2026-10-15T00:00:00Z' });
    expect(get).toHaveBeenCalledWith({ title: 'CPI', country: undefined, limit: 20, asOf: Date.parse('2026-10-15T00:00:00Z') });
    expect(await tool?.call(ctx, { title: 'CPI', limit: 21 })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('says there is no history yet when nothing matches', async () => {
    expect(await setup(null).tool?.call(ctx, { title: 'Obscure', country: 'JPY' })).toEqual({ ok: true, data: { available: false, source: 'calendar history',
      reason: 'no history yet for "Obscure" (JPY): it has not been released while we were recording' } });
  });
});
