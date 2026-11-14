import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { ReleaseWatch } from '../application/release-watch';
import type { WhatToWatch } from '../application/what-to-watch';

const logger = new Logger('WhatToWatch');

/**
 * A fresh What to watch for every user before the Indian open (08:30 IST on weekdays), and items judged every 30 minutes once their time is up.
 * Every hour, each user's high-impact releases for the day ahead get their task, so the brief comes before the release without being asked.
 */
export class WhatToWatchJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly watch: WhatToWatch, private readonly releases: ReleaseWatch, private readonly users: () => Promise<string[]>) {}

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
    await this.scheduler.register({ name: 'release-watch', cron: '5 * * * *', tz: 'Asia/Kolkata', graceMs: 30 * 60_000, maxRuntimeMs: 10 * 60_000,
      run: async signal => {
        let created = 0;
        for (const id of await this.users()) {
          if (signal.aborted) break;
          try { created += await this.releases.planFor(id); } catch (error) { logger.warn({ message: 'release watch failed', userId: id, error: error instanceof Error ? error.message : String(error) }); }
        }
        if (created > 0) logger.log({ message: 'release tasks created', created });
      } });
  }
}
