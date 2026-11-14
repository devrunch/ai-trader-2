import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { WhatToWatch } from '../application/what-to-watch';

const logger = new Logger('WhatToWatch');

/** A fresh What to watch for every user before the Indian open (08:30 IST on weekdays), and items judged every 30 minutes once their time is up. */
export class WhatToWatchJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly watch: WhatToWatch, private readonly users: () => Promise<string[]>) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'what-to-watch', cron: '30 8 * * 1-5', tz: 'Asia/Kolkata', graceMs: 2 * 3_600_000, maxRuntimeMs: 20 * 60_000,
      run: async signal => {
        let written = 0;
        for (const id of await this.users()) {
          if (signal.aborted) break;
          try { await this.watch.refresh(id, true); written++; } catch (error) { logger.warn({ message: 'what to watch failed', userId: id, error: error instanceof Error ? error.message : String(error) }); }
        }
        logger.log({ message: 'what to watch written', users: written });
      } });
    await this.scheduler.register({ name: 'what-to-watch-judge', cron: '*/30 * * * *', tz: 'Asia/Kolkata', graceMs: 0, maxRuntimeMs: 5 * 60_000,
      run: async () => { const judged = await this.watch.judgeDue(); if (judged > 0) logger.log({ message: 'what to watch judged', judged }); } });
  }
}
