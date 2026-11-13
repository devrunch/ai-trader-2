import { describe, expect, it, vi } from 'vitest';
import { CaptureActuals } from './capture-actuals';
import type { ActualsSource } from './ports/actuals-source';
import type { ActualUpdate, ActualsStore, PendingEvent } from './ports/actuals-store';

const now = Date.parse('2026-11-12T13:45:00Z');
const signal = new AbortController().signal;
const minutesAgo = (m: number): string => new Date(now - m * 60_000).toISOString();

interface Row extends PendingEvent { surprise: number | null; surpriseZ: number | null; source: string | null }
function fixture(rows: Row[], history: number[] = []) {
  const state = new Map(rows.map(r => [r.id, r]));
  const log = vi.fn();
  const saved: ActualUpdate[] = [];
  const store: ActualsStore = {
    pending: (from, to, recheckAfter) => Promise.resolve([...state.values()].filter(r => Date.parse(r.at) >= from && Date.parse(r.at) <= to
      && (r.actual === null || Date.parse(r.actualAt ?? '') >= recheckAfter))),
    surprises: () => Promise.resolve(history),
    save: u => { saved.push(u); const r = state.get(u.eventId); if (r) state.set(u.eventId, { ...r, actual: u.actual, actualAt: u.actualAt, surprise: u.surprise, surpriseZ: u.surpriseZ, source: u.source }); return Promise.resolve(); },
  };
  return { store, saved, log, state, make: (...sources: ActualsSource[]) => new CaptureActuals(sources, store, { now: () => now, log }) };
}
const cpi = (over: Partial<Row> = {}): Row => ({ id: 'cpi', title: 'CPI m/m', country: 'USD', at: minutesAgo(15), forecast: '0.3%', previous: '0.2%', actual: null, actualAt: null, surprise: null, surpriseZ: null, source: null, ...over });

describe('CaptureActuals', () => {
  it('stores the actual with its source, the surprise against the forecast and the z-score from the event\'s own history', async () => {
    const f = fixture([cpi()], [0.1, -0.1, 0.1, -0.1, 0.1, -0.1, 0.1, -0.1]);
    expect(await f.make({ fetch: () => Promise.resolve([{ eventId: 'cpi', actual: '0.5%', source: 'fred' }]) }).run(signal)).toBe(1);
    expect(f.saved).toEqual([{ eventId: 'cpi', actual: '0.5%', source: 'fred', actualAt: new Date(now).toISOString(), surprise: 0.2, surpriseZ: 2 }]);
  });

  it('stores a null z-score with fewer than 8 past releases, and a null surprise when the forecast is not a number', async () => {
    const f = fixture([cpi(), cpi({ id: 'rate', title: 'RBI Monetary Policy Decision', country: 'INR', forecast: null })], [0.1, 0.2]);
    await f.make({ fetch: () => Promise.resolve([{ eventId: 'cpi', actual: '0.5%', source: 'fred' }, { eventId: 'rate', actual: '5.50%', source: 'rbi-actuals' }]) }).run(signal);
    expect(f.saved.map(s => [s.eventId, s.surprise, s.surpriseZ])).toEqual([['cpi', 0.2, null], ['rate', null, null]]);
  });

  it('is idempotent: the same value again and a value for an event with a stored actual do not write', async () => {
    const f = fixture([cpi()]);
    const capture = f.make({ fetch: () => Promise.resolve([{ eventId: 'cpi', actual: '0.5%', source: 'fred' }]) });
    expect(await capture.run(signal)).toBe(1);
    expect(await capture.run(signal)).toBe(0);
    expect(f.saved).toHaveLength(1);
  });

  it('lets the source correct a value it gave within a day, and logs it', async () => {
    const f = fixture([cpi({ actual: '0.4%', actualAt: minutesAgo(5), source: 'fred' })]);
    expect(await f.make({ fetch: () => Promise.resolve([{ eventId: 'cpi', actual: '0.5%', source: 'fred' }]) }).run(signal)).toBe(1);
    expect(f.state.get('cpi')?.actual).toBe('0.5%');
    expect(f.log).toHaveBeenCalledWith('actual corrected by the source', expect.objectContaining({ was: '0.4%', now: '0.5%' }));
  });

  it('never rewrites an actual stored more than a day ago', async () => {
    const f = fixture([cpi({ at: minutesAgo(60), actual: '0.4%', actualAt: new Date(now - 25 * 3_600_000).toISOString() })]);
    const capture = f.make({ fetch: () => Promise.resolve([{ eventId: 'cpi', actual: '0.9%', source: 'fred' }]) });
    expect(await capture.run(signal, { behindMs: 6 * 3_600_000, aheadMs: 0 })).toBe(0);
    expect(f.saved).toEqual([]);
  });

  it('asks only about events inside the window and ignores answers for other events', async () => {
    const asked: string[][] = [];
    const f = fixture([cpi(), cpi({ id: 'old', at: minutesAgo(200) }), cpi({ id: 'soon', at: minutesAgo(-30) })]);
    const capture = f.make({ fetch: events => { asked.push(events.map(e => e.id)); return Promise.resolve([{ eventId: 'ghost', actual: '1%', source: 'fred' }]); } });
    expect(await capture.run(signal, { behindMs: 90 * 60_000, aheadMs: 2 * 60_000 })).toBe(0);
    expect(asked).toEqual([['cpi']]);
  });

  it('keeps going when one source fails and takes the first source\'s answer for an event', async () => {
    const f = fixture([cpi()]);
    const failing: ActualsSource = { fetch: () => Promise.reject(new Error('HTTP 503')) };
    const first: ActualsSource = { fetch: () => Promise.resolve([{ eventId: 'cpi', actual: '0.5%', source: 'fred' }]) };
    const second: ActualsSource = { fetch: () => Promise.resolve([{ eventId: 'cpi', actual: '0.9%', source: 'other' }]) };
    expect(await f.make(failing, first, second).run(signal)).toBe(1);
    expect(f.saved[0]?.source).toBe('fred');
    expect(f.log).toHaveBeenCalledWith('actuals source failed', { error: 'HTTP 503' });
  });
});
