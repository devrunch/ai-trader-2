import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EconomicCalendar } from '../src/modules/calendar/application/calendar';
import { CaptureActuals } from '../src/modules/calendar/application/capture-actuals';
import { DrizzleCalendarStore } from '../src/modules/calendar/infrastructure/drizzle-calendar.store';
import * as schema from '../src/shared/database/schema';
import { startPostgres } from './support/containers';

const T0 = Date.parse('2026-11-12T13:30:00Z');
const iso = (offsetMin: number): string => new Date(T0 + offsetMin * 60_000).toISOString();
const event = (id: string, at: string, over: Partial<{ title: string; country: string; forecast: string | null }> = {}) =>
  ({ id, title: over.title ?? 'CPI m/m', country: over.country ?? 'USD', at, impact: 'High' as const, forecast: over.forecast === undefined ? '0.3%' : over.forecast, previous: '0.2%', moves: [] });

describe('event actuals store', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let store: DrizzleCalendarStore;
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    await migrate(drizzle(pool, { schema }), { migrationsFolder: './drizzle' });
    store = new DrizzleCalendarStore(drizzle(pool, { schema }));
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('saves the actual, source, time, surprise and z-score and returns them from between()', async () => {
    await store.upsert([event('a1', iso(0))]);
    await store.save({ eventId: 'a1', actual: '0.5%', source: 'fred', actualAt: iso(2), surprise: 0.2, surpriseZ: 1.5 });
    const [row] = await store.between(T0 - 1000, T0 + 1000);
    expect(row).toMatchObject({ id: 'a1', actual: '0.5%', actualSource: 'fred', actualAt: iso(2), surprise: 0.2, surpriseZ: 1.5 });
  });

  it('keeps the actual and surprise when ForexFactory refreshes the schedule, while forecast and impact update', async () => {
    await store.upsert([{ ...event('a1', iso(0), { forecast: '0.4%' }), impact: 'Medium' }]);
    const [row] = await store.between(T0 - 1000, T0 + 1000);
    expect(row).toMatchObject({ forecast: '0.4%', impact: 'Medium', actual: '0.5%', actualSource: 'fred', surprise: 0.2, surpriseZ: 1.5 });
  });

  it('returns no actual for a row that has none', async () => {
    await store.upsert([event('b1', iso(60))]);
    const row = (await store.between(T0 + 59 * 60_000, T0 + 61 * 60_000))[0];
    expect(row).toMatchObject({ id: 'b1', actual: null, actualSource: null, actualAt: null, surprise: null, surpriseZ: null });
  });

  it('lists pending events in the window: no actual yet, or one stored since the recheck time', async () => {
    await store.upsert([event('p1', iso(10)), event('p2', iso(11)), event('p3', iso(12)), event('p4', iso(500))]);
    await store.save({ eventId: 'p2', actual: '1', source: 'fred', actualAt: iso(20), surprise: null, surpriseZ: null });
    await store.save({ eventId: 'p3', actual: '1', source: 'fred', actualAt: iso(1), surprise: null, surpriseZ: null });
    const ids = (await store.pending(T0 + 9 * 60_000, T0 + 13 * 60_000, T0 + 15 * 60_000)).map(e => e.id).sort();
    expect(ids).toEqual(['p1', 'p2']);
  });

  it('returns earlier surprises of the same country and title, newest first, before the given time', async () => {
    for (let i = 1; i <= 5; i++) {
      const id = `h${String(i)}`;
      await store.upsert([event(id, iso(-i * 1440), { title: 'Unemployment Rate' })]);
      await store.save({ eventId: id, actual: '4', source: 'fred', actualAt: iso(-i * 1440 + 1), surprise: i, surpriseZ: null });
    }
    await store.upsert([event('h-other', iso(-1440), { title: 'Unemployment Rate', country: 'CAD' }), event('h-now', iso(0), { title: 'Unemployment Rate' })]);
    await store.save({ eventId: 'h-other', actual: '4', source: 'fred', actualAt: iso(-1439), surprise: 99, surpriseZ: null });
    expect(await store.surprises('USD', 'Unemployment Rate', T0, 3)).toEqual([1, 2, 3]);
    expect(await store.surprises('USD', 'Unemployment Rate', T0 - 3 * 1440 * 60_000, 10)).toEqual([4, 5]);
  });

  it('captures through the real store and hides the actual from a replay before it was stored', async () => {
    const at = iso(300);
    await store.upsert([event('c1', at, { title: 'Retail Sales m/m' })]);
    const now = T0 + 302 * 60_000;
    const capture = new CaptureActuals([{ fetch: events => Promise.resolve(events.filter(e => e.id === 'c1').map(e => ({ eventId: e.id, actual: '0.5%', source: 'fred' }))) }], store, { now: () => now, log: () => undefined });
    expect(await capture.run(new AbortController().signal)).toBe(1);
    expect(await capture.run(new AbortController().signal)).toBe(0);
    const calendar = new EconomicCalendar({ fetch: () => Promise.resolve([]) }, store, { now: () => now, id: e => e.title });
    const live = (await calendar.list({ days: 1, impact: 'Medium' })).find(e => e.id === 'c1');
    expect([live?.actual, live?.actualSource, live?.surprise]).toEqual(['0.5%', 'fred', 0.2]);
    const replay = (await calendar.list({ days: 1, impact: 'Medium' }, Date.parse(at) + 60_000)).find(e => e.id === 'c1');
    expect([replay?.actual, replay?.actualSource, replay?.surprise, replay?.surpriseZ]).toEqual([null, null, null, null]);
  });
});
