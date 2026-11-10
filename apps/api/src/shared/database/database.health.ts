import type { OnModuleInit } from '@nestjs/common';
import { backoffDelay, withTimeout } from '@aitrader/resilience';
import { ReadinessRegistry, type ReadinessResult } from '../health';
import { UnavailableError } from '../errors';
import type { Pool } from 'pg';
import { watchCheckedOut } from './checked-out';

export class DatabaseHealth implements OnModuleInit {
  private attempt = 0;
  private nextAttempt = 0;

  constructor(private readonly pool: Pool, private readonly readiness: ReadinessRegistry) {}

  onModuleInit(): void {
    this.readiness.register('database', () => this.check());
  }

  private async check(): Promise<ReadinessResult> {
    if (Date.now() < this.nextAttempt) return { status: 'down', reason: 'Database reconnect backoff' };
    try {
      await withTimeout(async (signal) => {
        const client = await this.pool.connect();
        if (signal.aborted) { client.release(true); throw new UnavailableError('Database unavailable'); }
        const watch = watchCheckedOut(client);
        let released = false;
        const release = (destroy: boolean) => {
          if (released) return;
          released = true;
          watch.stop();
          client.release(destroy || watch.failed());
        };
        const abort = () => { release(true); };
        signal.addEventListener('abort', abort, { once: true });
        try {
          await client.query('select 1');
        } finally {
          signal.removeEventListener('abort', abort);
          release(signal.aborted);
        }
      }, 1500);
      this.attempt = 0;
      this.nextAttempt = 0;
      return { status: 'up' };
    } catch {
      this.nextAttempt = Date.now() + backoffDelay(this.attempt++, { baseMs: 200, maxMs: 10_000 });
      return { status: 'down', reason: new UnavailableError('Database unavailable').message };
    }
  }
}
