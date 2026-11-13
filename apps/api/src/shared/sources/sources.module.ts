import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config';
import { REDIS, RedisTokenBucket } from '../redis';
import { SourceClient, type SourceBucketFactory } from './client';
import { RedisSourceHealth, type SourceHealth } from './health';
import { SourceRegistry } from './registry';

export const SOURCE_HEALTH = Symbol('SOURCE_HEALTH');

/** Only string values can name a key; the registry treats blank or missing as unset. */
const envOf = (config: AppConfig): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(config).map(([key, value]) => [key, typeof value === 'string' ? value : undefined]));

const redisBuckets = (redis: Redis): SourceBucketFactory => (id, limit) =>
  new RedisTokenBucket(redis, `source-limit:${id}`, Math.max(1, limit.requests), limit.requests / limit.windowSec);

/**
 * The registry, the client and the health store. Each owner module registers its descriptors in its own module (`registry.register(...)` in a provider
 * factory); the admin view lists them all. Global so an adapter anywhere can inject `SourceClient`.
 */
@Global()
@Module({
  providers: [
    { provide: SourceRegistry, inject: [APP_CONFIG], useFactory: (config: AppConfig) => new SourceRegistry(envOf(config)) },
    { provide: SOURCE_HEALTH, inject: [REDIS], useFactory: (redis: Redis): SourceHealth => new RedisSourceHealth(redis) },
    { provide: SourceClient, inject: [SourceRegistry, SOURCE_HEALTH, REDIS], useFactory: (registry: SourceRegistry, health: SourceHealth, redis: Redis) => new SourceClient(registry, health, redisBuckets(redis)) },
  ],
  exports: [SourceRegistry, SOURCE_HEALTH, SourceClient],
})
export class SourcesModule {}
