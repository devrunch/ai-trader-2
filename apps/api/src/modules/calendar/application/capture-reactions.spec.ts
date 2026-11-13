import type { EventReaction } from '@aitrader/contracts';
import { describe, expect, it } from 'vitest';
import { CaptureReactions } from './capture-reactions';
import type { DueEvent, ReactionStore } from './ports/reaction-store';

const REL = Date.parse('2026-11-11T13:30:00Z');
const NOW = REL + 70 * 60_000;
const oil: DueEvent = { id: 'e1', title: 'Crude Oil Inventories', country: 'USD', at: new Date(REL).toISOString() };
const bars = [{ time: REL, open: 100, close: 100 }, { time: REL + 4 * 60_000, open: 100, close: 100.5 }, { time: REL + 14 * 60_000, open: 100, close: 101 }, { time: REL + 59 * 60_000, open: 100, close: 99 }];

function fixture(due: DueEvent[], data: Record<string, typeof bars>) {
  const saved = new Map<string, EventReaction[]>();
  const ranges: Array<[number, number]> = [];
  const store: ReactionStore = { pastReleases: () => Promise.resolve([]), reactionsFor: () => Promise.resolve(new Map()),
    withoutReactions: (from, to) => { ranges.push([from, to]); return Promise.resolve(due.filter(d => !saved.has(d.id))); },
    save: (id, rows) => { saved.set(id, rows); return Promise.resolve(); } };
  const capture = new CaptureReactions(store, { window: (symbols, from, to) => Promise.resolve(new Map(symbols.flatMap(s => (data[s] ? [[s, data[s].filter(b => b.time >= from && b.time < to)] as [string, typeof bars]] : [])))) }, () => NOW);
  return { capture, saved, ranges };
}

describe('capture reactions', () => {
  it('asks for events 65 minutes to 3 days old and stores moves for the canonical instruments only', async () => {
    const { capture, saved, ranges } = fixture([oil], { 'MCX:CRUDEOIL1!': bars });
    expect(await capture.run()).toBe(1);
    expect(ranges).toEqual([[NOW - 3 * 86_400_000, NOW - 65 * 60_000]]);
    const rows = saved.get('e1') ?? [];
    expect(rows.find(r => r.symbol === 'MCX:CRUDEOIL1!')).toEqual({ symbol: 'MCX:CRUDEOIL1!', refPrice: 100, move5Pct: 0.5, move15Pct: 1, move60Pct: -1 });
    // The other canonical instruments of a USD release had no bars in this fixture: kept with null moves, not invented.
    expect(rows.filter(r => r.symbol !== 'MCX:CRUDEOIL1!').every(r => r.refPrice === null && r.move15Pct === null)).toBe(true);
  });
  it('leaves an event without any stored bars for the next run and does not store twice', async () => {
    const empty = fixture([oil], {});
    expect(await empty.capture.run()).toBe(0);
    const { capture, saved } = fixture([oil], { 'MCX:CRUDEOIL1!': bars });
    await capture.run();
    expect(await capture.run()).toBe(0);
    expect(saved.size).toBe(1);
  });
  it('skips events with no canonical instruments', async () => {
    expect(await fixture([{ ...oil, title: 'CPI m/m', country: 'GBP' }], {}).capture.run()).toBe(0);
  });
});
