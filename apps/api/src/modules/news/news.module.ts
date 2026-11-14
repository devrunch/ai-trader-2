import { createHash } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { DB, type Database } from '../../shared/database';
import { createLanguageModel, parseModelSpec } from '../../shared/llm/model-factory';
import { REDIS } from '../../shared/redis';
import { RedisDailyBudget } from '../../shared/redis/daily-budget';
import { SourceClient, SourceRegistry, type SourceDescriptor } from '../../shared/sources';
import { JobScheduler } from '../../shared/jobs';
import { AuthModule } from '../auth/auth.module';
import { Watchlists } from '../watchlists/application/index';
import { WatchlistsModule } from '../watchlists/watchlists.module';
import { NewsController } from './api/news.controller';
import { NewsService, type NewsSource } from './application/news';
import { SentimentService } from './application/sentiment';
import { assessImpact } from './domain/impact';
import { tagger } from './domain/tagging';
import { DrizzleNewsStore } from './infrastructure/drizzle-news.store';
import { NewsJob } from './infrastructure/news.job';
import { ALPHAVANTAGE_NEWS_DESCRIPTOR, AlphaVantageNewsSource } from './infrastructure/sources/alphavantage-news.source';
import { FINBERT_DESCRIPTOR, FinbertScorer } from './infrastructure/sources/finbert.source';
import { LLM_SENTIMENT_DESCRIPTOR, LlmScorer } from './infrastructure/sources/llm-sentiment.source';
import { NEWSAPI_DESCRIPTOR, NewsApiSource } from './infrastructure/sources/newsapi.source';
import { NEWSDATA_DESCRIPTOR, NewsdataSource } from './infrastructure/sources/newsdata.source';
import { REDDIT_DESCRIPTOR, RedditSource, SUBREDDITS } from './infrastructure/sources/reddit.source';
import { RSS_DESCRIPTORS, RSS_FEEDS, RssSource } from './infrastructure/sources/rss.source';
import { YAHOO_TICKER_DESCRIPTOR, YahooTickerRssSource } from './infrastructure/sources/yahoo-ticker-rss.source';

const logger = new Logger('News');
const NEWS_SOURCE_DESCRIPTORS = Symbol('NEWS_SOURCE_DESCRIPTORS');
const warn = (message: string, detail: Record<string, unknown>): void => { logger.warn({ message, ...detail }); };

/** Every enabled headline source; a keyed source is left out, not failed, while its key is unset. */
function newsSources(config: AppConfig, registry: SourceRegistry, client: SourceClient, watchlists: Watchlists): NewsSource[] {
  const on = (descriptor: SourceDescriptor): boolean => registry.isEnabled(descriptor.id);
  return [
    ...RSS_FEEDS.map(f => new RssSource(f.name, f.id, f.url, client, f.markets)),
    new YahooTickerRssSource(() => watchlists.allSymbols(), client),
    ...SUBREDDITS.map(s => new RedditSource(s.name, s.market, client)),
    ...(config.NEWS_API_KEY && on(NEWSAPI_DESCRIPTOR) ? [new NewsApiSource(config.NEWS_API_KEY, client)] : []),
    ...(config.NEWSDATA_API_KEY && on(NEWSDATA_DESCRIPTOR) ? [new NewsdataSource(config.NEWSDATA_API_KEY, client)] : []),
    ...(config.ALPHAVANTAGE_API_KEY && on(ALPHAVANTAGE_NEWS_DESCRIPTOR) ? [new AlphaVantageNewsSource(config.ALPHAVANTAGE_API_KEY, client)] : []),
  ];
}

function sentimentService(config: AppConfig, registry: SourceRegistry, client: SourceClient, redis: Redis): SentimentService {
  const spec = config.DESK_MODEL ?? config.AGENT_MODEL;
  const llm = spec && config.NEWS_LLM_DAILY > 0 ? new LlmScorer(createLanguageModel(parseModelSpec(spec), config), client) : null;
  const finbert = config.HF_API_TOKEN && config.FINBERT_MODEL && registry.isEnabled(FINBERT_DESCRIPTOR.id) ? new FinbertScorer(config.HF_API_TOKEN, config.FINBERT_MODEL, client) : null;
  return new SentimentService(llm, finbert, new RedisDailyBudget(redis, 'news-llm', config.NEWS_LLM_DAILY), warn);
}

@Module({
  imports: [AuthModule, WatchlistsModule],
  controllers: [NewsController],
  providers: [
    { provide: NEWS_SOURCE_DESCRIPTORS, inject: [SourceRegistry], useFactory: (registry: SourceRegistry): SourceDescriptor[] => {
      const descriptors = [...RSS_DESCRIPTORS, NEWSAPI_DESCRIPTOR, NEWSDATA_DESCRIPTOR, ALPHAVANTAGE_NEWS_DESCRIPTOR, YAHOO_TICKER_DESCRIPTOR, REDDIT_DESCRIPTOR, LLM_SENTIMENT_DESCRIPTOR, FINBERT_DESCRIPTOR];
      registry.register(...descriptors);
      return descriptors;
    } },
    { provide: NewsService, inject: [DB, APP_CONFIG, SourceClient, SourceRegistry, REDIS, Watchlists, NEWS_SOURCE_DESCRIPTORS],
      useFactory: (db: Database, config: AppConfig, client: SourceClient, registry: SourceRegistry, redis: Redis, watchlists: Watchlists) => new NewsService(
        newsSources(config, registry, client, watchlists), new DrizzleNewsStore(db), tagger(), assessImpact,
        { now: Date.now, id: url => createHash('sha1').update(url).digest('hex'), warn }, sentimentService(config, registry, client, redis)) },
    { provide: NewsJob, inject: [JobScheduler, NewsService], useFactory: (scheduler: JobScheduler, news: NewsService) => new NewsJob(scheduler, news) },
  ],
  exports: [NewsService],
})
export class NewsModule {}
