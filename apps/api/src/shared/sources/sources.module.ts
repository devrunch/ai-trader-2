import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config';
import { REDIS } from '../redis';
import { SourceClient } from './client';
import { RedisSourceHealth, type SourceHealth } from './health';
import { SourceRegistry } from './registry';

export const SOURCE_HEALTH = Symbol('SOURCE_HEALTH');

/**
 * The registry, the client and the health store. Each owner module registers its descriptors in its own module (`registry.register(...)` in a provider
 * factory); the admin view lists them all. Global so an adapter anywhere can inject `SourceClient`.
 */
@Global()
@Module({
  providers: [
    { provide: SourceRegistry, inject: [APP_CONFIG], useFactory: (config: AppConfig) => new SourceRegistry(config as unknown as Record<string, string | undefined>) },
    { provide: SOURCE_HEALTH, inject: [REDIS], useFactory: (redis: Redis): SourceHealth => new RedisSourceHealth(redis) },
    { provide: SourceClient, inject: [SourceRegistry, SOURCE_HEALTH, REDIS], useFactory: (registry: SourceRegistry, health: SourceHealth, redis: Redis) => new SourceClient(registry, health, redis) },
  ],
  exports: [SourceRegistry, SOURCE_HEALTH, SourceClient],
})
export class SourcesModule {}
