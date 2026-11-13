import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { FundamentalsService } from '../application/fundamentals';
import type { Nifty500List } from '../application/ports/fundamentals-store';

const logger = new Logger('Fundamentals');

/**
 * Refreshes the NIFTY 500 early morning IST at no more than one request per 3 s (the source's rate limit paces it). It runs twice: the second pass finishes
 * what an interrupted first pass left, because symbols fetched in the last 20 h are skipped.
 */
export class FundamentalsJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly fundamentals: FundamentalsService, private readonly list: Nifty500List) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'fundamentals-refresh', cron: '0 2,4 * * *', tz: 'Asia/Kolkata', graceMs: 3_600_000, maxRuntimeMs: 2 * 3_600_000,
      run: async signal => {
        const symbols = await this.list.symbols();
        if (symbols.length === 0) { logger.warn('no NIFTY 500 list available, nothing to refresh'); return; }
        const r = await this.fundamentals.refreshAll(symbols, signal);
        logger.log({ message: 'fundamentals refreshed', refreshed: r.refreshed, skipped: r.skipped, failed: r.failed.length });
      } });
  }
}
