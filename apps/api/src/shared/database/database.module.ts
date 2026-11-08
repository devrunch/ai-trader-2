import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { APP_CONFIG, type AppConfig } from '../config';
import { DatabaseHealth } from './database.health';
import * as schema from './schema';
import { ReadinessRegistry } from '../health';

export const DB = Symbol('DB');
export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Database => {
        const logger = new Logger('Database');
        const pool = new Pool({
          connectionString: config.DATABASE_URL, max: config.DATABASE_POOL_MAX,
          connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000,
          options: '-c statement_timeout=5000',
        });
        pool.on('error', () => { logger.warn('Database idle connection failed'); });
        return drizzle(pool, { schema });
      },
    },
    {
      provide: DatabaseHealth, inject: [DB, ReadinessRegistry],
      useFactory: (database: Database, readiness: ReadinessRegistry) => new DatabaseHealth(database.$client, readiness),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly database: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.$client.end();
  }
}
