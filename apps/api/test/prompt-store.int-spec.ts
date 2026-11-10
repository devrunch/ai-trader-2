import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { ConflictError } from '../src/shared/errors';
import { DrizzlePromptStore } from '../src/modules/agent/infrastructure/drizzle-prompt.store';
import { startPostgres } from './support/containers';

describe('DrizzlePromptStore (versions like commits)', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let store: DrizzlePromptStore;
  beforeAll(async () => {
    container = await startPostgres();
    pool = new Pool({ connectionString: container.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    store = new DrizzlePromptStore(db);
  });
  afterAll(async () => { await pool.end(); await container.stop(); });

  const version = (n: number, content: string) => ({ key: 'system', version: n, content, parentVersion: n - 1, message: `v${String(n)}`, author: 'admin', createdAt: '2026-11-10T00:00:00.000Z' });

  it('appends versions and returns them newest first', async () => {
    await store.append(version(1, 'one'));
    await store.append(version(2, 'two'));
    expect((await store.history('system')).map(v => [v.version, v.content])).toEqual([[2, 'two'], [1, 'one']]);
  });

  it('a concurrent save of the same version is a 409, never an overwrite', async () => {
    await expect(store.append(version(2, 'someone else'))).rejects.toBeInstanceOf(ConflictError);
    expect((await store.history('system'))[0]?.content).toBe('two');
  });
});
