import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { DrizzleOptionSnapshotStore } from '../src/modules/options/infrastructure/drizzle-option-snapshot.store';
import type { OptionSnapshot } from '../src/modules/options/application/ports/options-ports';
import { startPostgres } from './support/containers';

const at = (iso: string): number => Date.parse(iso);
const snap = (takenAt: string, oi: number, underlying = 'NIFTY'): OptionSnapshot => ({ underlying, expiry: '2026-11-19', takenAt: at(takenAt), spot: 24500,
  legs: [{ symbol: 'NFO:NIFTY2611924500CE', strike: 24500, type: 'CE', ltp: 100, oi, volume: 5 }] });

describe('option snapshot store (FR time machine, DATA-SOURCES rule 6)', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let store: DrizzleOptionSnapshotStore;
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    await migrate(drizzle(pool, { schema }), { migrationsFolder: './drizzle' });
    store = new DrizzleOptionSnapshotStore(drizzle(pool, { schema }));
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('returns the newest snapshot at or before the bound and never a later one', async () => {
    await store.save(snap('2026-11-12T10:00:00Z', 1));
    await store.save(snap('2026-11-13T10:00:00Z', 2));
    expect((await store.latest('NIFTY', '2026-11-19', at('2026-11-13T10:00:00Z')))?.legs[0]?.oi).toBe(2);
    expect((await store.latest('NIFTY', '2026-11-19', at('2026-11-12T23:00:00Z')))?.legs[0]?.oi).toBe(1);
    expect(await store.latest('NIFTY', '2026-11-19', at('2026-11-11T00:00:00Z'))).toBeNull();
  });
  it('finds the baseline strictly before a moment', async () => {
    expect((await store.before('NIFTY', '2026-11-19', at('2026-11-13T10:00:00Z')))?.legs[0]?.oi).toBe(1);
  });
  it('saving the same snapshot twice keeps one row', async () => {
    await store.save(snap('2026-11-13T10:00:00Z', 99));
    expect((await store.latest('NIFTY', '2026-11-19', at('2026-11-13T10:00:00Z')))?.legs[0]?.oi).toBe(2);
  });
  it('lists recent underlyings and purges old snapshots', async () => {
    await store.save(snap('2026-11-13T10:00:00Z', 5, 'BANKNIFTY'));
    expect((await store.recentUnderlyings(at('2026-11-13T00:00:00Z'))).sort()).toEqual(['BANKNIFTY', 'NIFTY']);
    expect(await store.purge(at('2026-11-13T00:00:00Z'))).toBe(1);
  });
});
