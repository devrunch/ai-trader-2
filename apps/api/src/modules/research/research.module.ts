import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { REDIS } from '../../shared/redis';
import { RedisDailyBudget } from '../../shared/redis/daily-budget';
import { SourceClient, SourceRegistry } from '../../shared/sources';
import { ResearchService } from './application/research';
import { TAVILY_DESCRIPTOR, TavilySource } from './infrastructure/sources/tavily.source';

@Module({
  providers: [
    { provide: ResearchService, inject: [APP_CONFIG, SourceRegistry, SourceClient, REDIS], useFactory: (config: AppConfig, registry: SourceRegistry, client: SourceClient, redis: Redis) => {
      registry.register(TAVILY_DESCRIPTOR);
      return new ResearchService(config.TAVILY_API_KEY ? new TavilySource(config.TAVILY_API_KEY, client) : null, new RedisDailyBudget(redis, 'web-search', config.AGENT_WEB_SEARCH_DAILY));
    } },
  ],
  exports: [ResearchService],
})
export class ResearchModule {}
