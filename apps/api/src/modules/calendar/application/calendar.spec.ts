import { describe, expect, it, vi } from 'vitest';
import { EconomicCalendar, type CalendarStore, type RawEvent, type StoredEvent } from './calendar';

const now = Date.parse('2026-11-11T06:00:00Z');
const ev = (title: string, country: string, hoursFromNow: number, impact: RawEvent['impact']): RawEvent =>
  ({ title, country, at: new Date(now + hoursFromNow * 3_600_000).toISOString(), impact, forecast: null, previous: null });

function setup(events: RawEvent[]) {
  const rows = new Map<string, RawEvent & { id: string }>();
  const store: CalendarStore = {
    upsert: list => { for (const e of list) rows.set(e.id, e); return Promise.resolve(); },
    between: (from, to) => Promise.resolve([...rows.values()].filter(e => Date.parse(e.at) >= from && Date.parse(e.at) <= to)),
  };
  const calendar = new EconomicCalendar({ fetch: vi.fn().mockResolvedValue(events) }, store, { now: () => now, id: e => `${e.country}|${e.title}|${e.at}` });
  return calendar;
}

describe('economic calendar', () => {
  it('lists upcoming events soonest first, from the impact asked for, with what each moves', async () => {
    const calendar = setup([ev('CPI m/m', 'USD', 30, 'High'), ev('German ZEW', 'EUR', 2, 'Medium'), ev('Housing starts', 'CAD', 1, 'Low'),
      ev('Crude Oil Inventories', 'USD', 5, 'Medium'), ev('Old release', 'USD', -10, 'High'), ev('Next month', 'USD', 24 * 9, 'High')]);
    expect(await calendar.refresh(new AbortController().signal)).toBe(6);
    const events = await calendar.list({ days: 7, impact: 'Medium' });
    expect(events.map(e => e.title)).toEqual(['German ZEW', 'Crude Oil Inventories', 'CPI m/m']);
    expect(events[1]?.moves[0]).toBe('MCX:CRUDEOIL1!');
    expect(events[2]?.moves).toContain('FX:USDINR');
    expect((await calendar.list({ days: 7, impact: 'High', country: 'USD' })).map(e => e.title)).toEqual(['CPI m/m']);
  });
});

describe('economic calendar actuals and specs', () => {
  const spec = { measures: 'Prices', usualEffect: "'Actual' greater than 'Forecast' is good for currency", why: 'Inflation', notes: '', source: 'BLS', beat: 'higher-better' as const };
  const stored = (over: Partial<StoredEvent>): StoredEvent => ({ id: 'cpi', title: 'CPI m/m', country: 'USD', at: new Date(now - 30 * 60_000).toISOString(), impact: 'High', forecast: '0.3%', previous: '0.2%', ...over });
  function over(rows: StoredEvent[]) {
    const store: CalendarStore = { upsert: () => Promise.resolve(), between: () => Promise.resolve(rows) };
    return new EconomicCalendar({ fetch: vi.fn() }, store, { now: () => now, id: e => e.title }, { lookup: (country, title) => (country === 'USD' && title === 'CPI m/m' ? spec : null) });
  }

  it('adds the spec of a known event and null for an unknown one', async () => {
    const events = await over([stored({}), stored({ id: 'x', title: 'Mystery' })]).list({ days: 1, impact: 'Medium' });
    expect(events.map(e => e.spec)).toEqual([spec, null]);
  });

  it('returns the stored actual, source and surprise, and nulls when there is none', async () => {
    const actualAt = new Date(now - 10 * 60_000).toISOString();
    const events = await over([stored({ actual: '0.5%', actualSource: 'fred', actualAt, surprise: 0.2, surpriseZ: 1.5 }), stored({ id: 'y', title: 'Other' })]).list({ days: 1, impact: 'Medium' });
    expect(events.map(e => [e.actual, e.actualSource, e.surprise, e.surpriseZ])).toEqual([['0.5%', 'fred', 0.2, 1.5], [null, null, null, null]]);
    expect(events[0]).not.toHaveProperty('actualAt');
  });

  it('hides an actual stored after asOf, so a replay never sees the future', async () => {
    const row = stored({ actual: '0.5%', actualSource: 'fred', actualAt: new Date(now + 5 * 60_000).toISOString(), surprise: 0.2, surpriseZ: 1.5 });
    const before = await over([row]).list({ days: 1, impact: 'Medium' }, now);
    expect([before[0]?.actual, before[0]?.actualSource, before[0]?.surprise, before[0]?.surpriseZ]).toEqual([null, null, null, null]);
    const after = await over([row]).list({ days: 1, impact: 'Medium' }, now + 6 * 60_000);
    expect(after[0]?.actual).toBe('0.5%');
  });
});
