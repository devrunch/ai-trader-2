import { describe, expect, it, vi } from 'vitest';
import type { SourceClient } from '../../../shared/sources';
import { EconomicCalendar, type CalendarStore, type EventSource, type RawEvent } from '../application/calendar';
import { MergedSource } from '../application/merged-source';
import { IndiaScheduleSource } from './india-schedule.source';

const now = Date.parse('2026-11-30T02:00:00Z');

function calendarOver(source: EventSource) {
  const rows = new Map<string, RawEvent & { id: string }>();
  const store: CalendarStore = {
    upsert: list => { for (const e of list) rows.set(e.id, e); return Promise.resolve(); },
    between: (from, to) => Promise.resolve([...rows.values()].filter(e => Date.parse(e.at) >= from && Date.parse(e.at) <= to)),
  };
  return new EconomicCalendar(source, store, { now: () => now, id: e => `${e.country}|${e.title}|${e.at}` });
}
const signal = new AbortController().signal;
const us: RawEvent = { title: 'CPI m/m', country: 'USD', at: new Date(now + 3_600_000).toISOString(), impact: 'High', forecast: null, previous: null };

describe('India schedule source', () => {
  it('returns only releases inside the window, as INR events in UTC', async () => {
    const events = await new IndiaScheduleSource(() => now, 1, 10).fetch();
    expect(events.map(e => [e.title, e.at, e.impact])).toEqual([
      ['India GDP q/q', '2026-11-30T10:30:00.000Z', 'High'],
      ['RBI Monetary Policy Decision', '2026-12-04T04:30:00.000Z', 'High'],
    ]);
    expect(events.every(e => e.country === 'INR')).toBe(true);
  });

  it('lists both feeds together and maps INR events to NIFTY and BANKNIFTY', async () => {
    const calendar = calendarOver(new MergedSource([{ fetch: () => Promise.resolve([us]) }, new IndiaScheduleSource(() => now, 1, 10)]));
    await calendar.refresh(signal);
    const events = await calendar.list({ days: 7, impact: 'High' });
    expect(events.map(e => e.title)).toEqual(['CPI m/m', 'India GDP q/q', 'RBI Monetary Policy Decision']);
    expect(events[1]?.moves).toEqual(['NSE:NIFTY', 'NSE:BANKNIFTY', 'FX:USDINR']);
  });

  it('still yields the Indian events when ForexFactory fails, and throws only when every feed fails', async () => {
    const failing: EventSource = { fetch: () => Promise.reject(new Error('HTTP 503')) };
    const calendar = calendarOver(new MergedSource([failing, new IndiaScheduleSource(() => now, 1, 10)]));
    expect(await calendar.refresh(signal)).toBe(2);
    await expect(new MergedSource([failing, failing]).fetch(signal)).rejects.toThrow('HTTP 503');
  });
});

describe('India schedule source health', () => {
  it('records upcoming releases per source and flags an exhausted schedule', async () => {
    const recordItems = vi.fn(() => Promise.resolve());
    const client = { recordItems } as unknown as SourceClient;
    await new IndiaScheduleSource(() => now, 1, 10, client).fetch();
    expect(recordItems).toHaveBeenCalledWith('rbi', 2);
    expect(recordItems).toHaveBeenCalledWith('mospi', 7);
    recordItems.mockClear();
    await new IndiaScheduleSource(() => Date.parse('2030-01-01T00:00:00Z'), 1, 10, client).fetch();
    expect(recordItems).toHaveBeenCalledWith('rbi', 0);
  });
});
