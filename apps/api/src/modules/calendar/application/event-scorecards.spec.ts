import type { EventReaction } from '@aitrader/contracts';
import { describe, expect, it } from 'vitest';
import { EventScorecards } from './event-scorecards';
import type { PastRelease, ReactionStore } from './ports/reaction-store';

const at = (h: number): string => new Date(Date.parse('2026-11-01T13:30:00Z') + h * 86_400_000).toISOString();
const rel = (id: string, day: number, surprise: number | null, over: Partial<PastRelease> = {}): PastRelease =>
  ({ id, title: 'CPI m/m', country: 'USD', at: at(day), forecast: '0.3%', previous: '0.2%', actual: surprise === null ? null : '0.4%', actualAt: surprise === null ? null : at(day), surprise, surpriseZ: null, ...over });
const react = (m15: number | null, m60: number | null = null): EventReaction[] => [{ symbol: 'NSE:NIFTY', refPrice: 100, move5Pct: 0.1, move15Pct: m15, move60Pct: m60 }];

function store(rows: PastRelease[], reactions: Record<string, EventReaction[]>): ReactionStore {
  return { pastReleases: q => Promise.resolve(rows.filter(r => r.title === q.title && (!q.country || r.country === q.country) && Date.parse(r.at) <= q.asOf).sort((a, b) => b.at.localeCompare(a.at)).slice(0, q.limit)),
    reactionsFor: ids => Promise.resolve(new Map(ids.flatMap(id => (reactions[id] ? [[id, reactions[id]] as [string, EventReaction[]]] : [])))),
    withoutReactions: () => Promise.resolve([]), save: () => Promise.resolve() };
}
const rows = [rel('a', 0, 0.1), rel('b', 7, -0.2), rel('c', 14, 0.3)];
const reactions = { a: react(0.4, 1), b: react(-0.6, -1), c: react(-0.2, 0.5) };
const cards = (asOfClock = Date.parse('2026-12-01T00:00:00Z')) => new EventScorecards(store(rows, reactions), () => null, () => asOfClock);

describe('event scorecards', () => {
  it('lists releases newest first up to the limit with per-symbol stats', async () => {
    const card = await cards().get({ title: 'CPI m/m', country: 'USD', limit: 2 });
    expect(card?.releases.map(r => r.eventId)).toEqual(['c', 'b']);
    expect(card?.stats).toEqual([{ symbol: 'NSE:NIFTY', n: 2, avgAbsMove15Pct: 0.4, avgMove15WhenBeatPct: -0.2, avgMove15WhenMissPct: -0.6, followedSurprisePct: 50 }]);
  });

  it('returns null for an event never stored', async () => { expect(await cards().get({ title: 'Nope', limit: 5 })).toBeNull(); });

  it('shows no release after asOf (leak test)', async () => {
    const card = await cards().get({ title: 'CPI m/m', limit: 10, asOf: Date.parse(at(7)) });
    expect(card?.releases.map(r => r.eventId)).toEqual(['b', 'a']);
  });

  it('hides the +60 move while asOf is before release+60 minutes and the actual before it was captured', async () => {
    const early = rel('d', 21, 0.5, { actualAt: new Date(Date.parse(at(21)) + 120_000).toISOString() });
    const sc = new EventScorecards(store([early], { d: react(0.3, 0.9) }), () => null);
    const mid = await sc.get({ title: 'CPI m/m', limit: 5, asOf: Date.parse(at(21)) + 30 * 60_000 });
    expect(mid?.releases[0]).toMatchObject({ actual: '0.4%', surprise: 0.5, reactions: [{ move5Pct: 0.1, move15Pct: 0.3, move60Pct: null }] });
    const before = await sc.get({ title: 'CPI m/m', limit: 5, asOf: Date.parse(at(21)) + 60_000 });
    expect(before?.releases[0]).toMatchObject({ actual: null, surprise: null, reactions: [{ move5Pct: null, move15Pct: null }] });
    const after = await sc.get({ title: 'CPI m/m', limit: 5, asOf: Date.parse(at(21)) + 61 * 60_000 });
    expect(after?.releases[0]?.reactions[0]?.move60Pct).toBe(0.9);
  });

  it('builds a scorecard per event id, asking the store once per title and country', async () => {
    const out = await cards().forEvents([{ id: 'x', title: 'CPI m/m', country: 'USD' }, { id: 'y', title: 'CPI m/m', country: 'USD' }, { id: 'z', title: 'Nope', country: 'USD' }], 3);
    expect([...out.keys()]).toEqual(['x', 'y']);
    expect(out.get('x')).toBe(out.get('y'));
  });
});

describe('reactions on the calendar list', () => {
  it('attaches reactions to released events only and hides horizons not yet passed', async () => {
    const sc = new EventScorecards(store(rows, reactions), () => null, () => Date.parse(at(0)) + 30 * 60_000);
    const out = await sc.withReactions([{ id: 'a', at: at(0) }, { id: 'c', at: at(14) }]);
    expect(out[0]?.reactions).toEqual([{ symbol: 'NSE:NIFTY', refPrice: 100, move5Pct: 0.1, move15Pct: 0.4, move60Pct: null }]);
    expect(out[1]).toEqual({ id: 'c', at: at(14) });
  });
});

describe('reactions on the calendar list', () => {
  it('attaches reactions to released events only and hides horizons not yet passed', async () => {
    const sc = new EventScorecards(store(rows, reactions), () => null, () => Date.parse(at(0)) + 30 * 60_000);
    const out = await sc.withReactions([{ id: 'a', at: at(0) }, { id: 'c', at: at(14) }]);
    expect(out[0]?.reactions).toEqual([{ symbol: 'NSE:NIFTY', refPrice: 100, move5Pct: 0.1, move15Pct: 0.4, move60Pct: null }]);
    expect(out[1]).toEqual({ id: 'c', at: at(14) });
  });
});
