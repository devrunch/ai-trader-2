import { createHash } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { DB, type Database } from '../../shared/database';
import { SourceClient, SourceRegistry, type SourceDescriptor } from '../../shared/sources';
import { JobScheduler } from '../../shared/jobs';
import { AuthModule } from '../auth/auth.module';
import { NewsController } from './api/news.controller';
import { NewsService } from './application/news';
import { assessImpact } from './domain/impact';
import { tagger } from './domain/tagging';
import { DrizzleNewsStore } from './infrastructure/drizzle-news.store';
import { NewsJob } from './infrastructure/news.job';
import { NEWSAPI_DESCRIPTOR, NewsApiSource } from './infrastructure/sources/newsapi.source';
import { RSS_DESCRIPTORS, RSS_FEEDS, RssSource } from './infrastructure/sources/rss.source';

const logger = new Logger('News');
const NEWS_SOURCE_DESCRIPTORS = Symbol('NEWS_SOURCE_DESCRIPTORS');

@Module({
  imports: [AuthModule],
  controllers: [NewsController],
  providers: [
    { provide: NEWS_SOURCE_DESCRIPTORS, inject: [SourceRegistry], useFactory: (registry: SourceRegistry): SourceDescriptor[] => {
      const descriptors = [...RSS_DESCRIPTORS, NEWSAPI_DESCRIPTOR];
      registry.register(...descriptors);
      return descriptors;
    } },
    { provide: NewsService, inject: [DB, APP_CONFIG, SourceClient, SourceRegistry, NEWS_SOURCE_DESCRIPTORS],
      useFactory: (db: Database, config: AppConfig, client: SourceClient, registry: SourceRegistry) => new NewsService(
      [...RSS_FEEDS.map(f => new RssSource(f.name, f.id, f.url, client)), ...(config.NEWS_API_KEY && registry.isEnabled(NEWSAPI_DESCRIPTOR.id) ? [new NewsApiSource(config.NEWS_API_KEY, client)] : [])],
      new DrizzleNewsStore(db), tagger(), assessImpact,
      { now: Date.now, id: url => createHash('sha1').update(url).digest('hex'), warn: (message, detail) => { logger.warn({ message, ...detail }); } }) },
    { provide: NewsJob, inject: [JobScheduler, NewsService], useFactory: (scheduler: JobScheduler, news: NewsService) => new NewsJob(scheduler, news) },
  ],
  exports: [NewsService],
})
export class NewsModule {}
