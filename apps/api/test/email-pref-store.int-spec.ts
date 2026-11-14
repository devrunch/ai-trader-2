import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { DrizzleEmailPrefStore } from '../src/modules/notifications/infrastructure/drizzle-email-pref.store';
import { startPostgres } from './support/containers';

describe('email report preferences', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let store: DrizzleEmailPrefStore;
  const withEmail = randomUUID();
  const plain = randomUUID();
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    for (const [id, name] of [[withEmail, 'trader'], [plain, 'plainname']] as const) await pool.query("INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, 'x', 'user')", [id, name]);
    store = new DrizzleEmailPrefStore(db);
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  it('is off until the user opts in, can be switched back, and is per user', async () => {
    expect(await store.reports(withEmail)).toBe(false);
    await store.setReports(withEmail, true);
    expect(await store.reports(withEmail)).toBe(true);
    expect(await store.reports(plain)).toBe(false);
    await store.setReports(withEmail, false);
    expect(await store.reports(withEmail)).toBe(false);
  });

  it('sends to the address the user gave, never to the login name', async () => {
    await store.setReports(withEmail, true, 'trader@example.com');
    expect(await store.address(withEmail)).toBe('trader@example.com');
    await store.setReports(withEmail, false);
    expect(await store.address(withEmail)).toBe('trader@example.com');
    expect(await store.address(plain)).toBeNull();
    expect(await store.address(randomUUID())).toBeNull();
  });
});
