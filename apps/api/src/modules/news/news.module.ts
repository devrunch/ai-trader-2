import { createHash } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { DB, type Database } from '../../shared/database';
import { JobScheduler } from '../../shared/jobs';
import { AuthModule } from '../auth/auth.module';
import { NewsController } from './api/news.controller';
import { NewsService } from './application/news';
import { tagger } from './domain/tagging';
import { DrizzleNewsStore } from './infrastructure/drizzle-news.store';
import { NewsJob } from './infrastructure/news.job';
import { NewsApiSource, RSS_FEEDS, RssSource } from './infrastructure/sources';

const logger = new Logger('News');

@Module({
  imports: [AuthModule],
  controllers: [NewsController],
  providers: [
    { provide: NewsService, inject: [DB, APP_CONFIG], useFactory: (db: Database, config: AppConfig) => new NewsService(
      [...RSS_FEEDS.map(f => new RssSource(f.name, f.url)), ...(config.NEWS_API_KEY ? [new NewsApiSource(config.NEWS_API_KEY)] : [])],
      new DrizzleNewsStore(db), tagger(),
      { now: Date.now, id: url => createHash('sha1').update(url).digest('hex'), warn: (message, detail) => { logger.warn({ message, ...detail }); } }) },
    { provide: NewsJob, inject: [JobScheduler, NewsService], useFactory: (scheduler: JobScheduler, news: NewsService) => new NewsJob(scheduler, news) },
  ],
  exports: [NewsService],
})
export class NewsModule {}
