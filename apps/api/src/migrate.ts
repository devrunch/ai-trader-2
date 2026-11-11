import { resolve } from 'node:path';
import process from 'node:process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/** Applies pending migrations from ./drizzle against DATABASE_URL; the release script runs it before the services restart. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: url, max: 1 });
  try { await migrate(drizzle(pool), { migrationsFolder: resolve(__dirname, '../drizzle') }); }
  finally { await pool.end(); }
  console.log('migrations applied');
}

main().catch((error: unknown) => { console.error(error); process.exit(1); });
