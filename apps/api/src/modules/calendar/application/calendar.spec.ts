import { describe, expect, it, vi } from 'vitest';
import { EconomicCalendar, type CalendarStore, type RawEvent } from './calendar';

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
    expect(events[1]?.moves.slice(0, 2)).toEqual(['Crude oil', 'MCX:CRUDEOIL']);
    expect(events[2]?.moves).toContain('USD/INR');
    expect((await calendar.list({ days: 7, impact: 'High', country: 'USD' })).map(e => e.title)).toEqual(['CPI m/m']);
  });
});
