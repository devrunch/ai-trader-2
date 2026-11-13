import { Logger, type OnModuleInit } from '@nestjs/common';
import type { JobScheduler } from '../../../shared/jobs';
import type { NewsService } from '../application/news';

const logger = new Logger('News');

/** Headlines every 5 minutes, scored for sentiment in the same run; anything past the 90-day retention (or the row cap) pruned nightly. */
export class NewsJob implements OnModuleInit {
  constructor(private readonly scheduler: JobScheduler, private readonly news: NewsService) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.register({ name: 'news-ingest', cron: '*/5 * * * *', tz: 'Asia/Kolkata', graceMs: 60_000, maxRuntimeMs: 240_000,
      run: async signal => { const r = await this.news.ingest(signal); if (r.stored > 0 || r.failed.length) logger.log({ message: 'news ingested', ...r }); } });
    await this.scheduler.register({ name: 'news-prune', cron: '30 3 * * *', tz: 'Asia/Kolkata', graceMs: 3_600_000, maxRuntimeMs: 60_000,
      run: async () => { await this.news.prune(); } });
  }
}
