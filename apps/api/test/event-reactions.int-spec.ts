import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { CaptureReactions } from '../src/modules/calendar/application/capture-reactions';
import { EventScorecards } from '../src/modules/calendar/application/event-scorecards';
import { DrizzleReactionStore } from '../src/modules/calendar/infrastructure/drizzle-reaction.store';
import { MinuteBars } from '../src/modules/market-data/application';
import { DrizzleStoredBarsReader } from '../src/modules/market-data/infrastructure/drizzle-stored-bars.reader';
import { startPostgres } from './support/containers';

const REL = Date.parse('2026-11-11T03:30:00Z');

describe('event reactions', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('captures moves once for a released event, then serves them through the scorecard as of a moment', async () => {
    const event = (id: string, at: number) => ({ id, title: 'Crude Oil Inventories', country: 'USD', at: new Date(at).toISOString(), impact: 'Medium', forecast: '-1.0M', previous: '0.5M' });
    await db.insert(schema.economicEvents).values([event('old', REL - 7 * 86_400_000), event('now', REL)]);
    // bars_1m is partitioned by month; the live writer creates months on demand, a raw insert needs the month to exist.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS bars_1m_202611 PARTITION OF bars_1m FOR VALUES FROM ('2026-11-01') TO ('2026-12-01')`);
    const closes: Array<[number, number]> = [[0, 100.5], [4, 100.5], [14, 101], [59, 99]];
    await db.insert(schema.bars1m).values(closes.map(([m, close]) => ({ instrumentId: 'MCX:CRUDEOIL1!', ts: new Date(REL + m * 60_000), open: 100, high: 102, low: 98, close, source: 'test' })));
    const store = new DrizzleReactionStore(db);
    const capture = new CaptureReactions(store, new MinuteBars(new DrizzleStoredBarsReader(db)), () => REL + 70 * 60_000);
    expect(await capture.run()).toBe(1);
    expect(await capture.run()).toBe(0);
    const cards = new EventScorecards(store, () => null, () => REL + 2 * 3_600_000);
    const card = await cards.get({ title: 'Crude Oil Inventories', country: 'USD', limit: 5 });
    expect(card?.releases.map(r => r.eventId)).toEqual(['now', 'old']);
    expect(card?.releases[0]?.reactions).toContainEqual({ symbol: 'MCX:CRUDEOIL1!', refPrice: 100, move5Pct: 0.5, move15Pct: 1, move60Pct: -1 });
    const early = await cards.get({ title: 'Crude Oil Inventories', country: 'USD', limit: 5, asOf: REL + 30 * 60_000 });
    expect(early?.releases[0]?.reactions.find(r => r.symbol === 'MCX:CRUDEOIL1!')).toMatchObject({ move15Pct: 1, move60Pct: null });
    const before = await cards.get({ title: 'Crude Oil Inventories', country: 'USD', limit: 5, asOf: REL - 1 });
    expect(before?.releases.map(r => r.eventId)).toEqual(['old']);
  });
});
