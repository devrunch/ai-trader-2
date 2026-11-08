import { Global, Inject, Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { backoffDelay, withTimeout } from '@aitrader/resilience';
import { APP_CONFIG, type AppConfig } from '../config';
import { RedisHealth } from './redis.health';
import { ReadinessRegistry } from '../health';
import { once } from 'node:events';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Redis => {
        const logger = new Logger('Redis');
        let lastWarning = -Infinity;
        const redis = new Redis(config.REDIS_URL, {
          lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false,
          connectTimeout: 3000, commandTimeout: 1000,
          retryStrategy: (n) => backoffDelay(n, { baseMs: 200, maxMs: 10_000 }),
        });
        redis.on('error', () => {
          if (Date.now() - lastWarning >= 10_000) {
            lastWarning = Date.now();
            logger.warn('Redis connection failed');
          }
        });
        return redis;
      },
    },
    {
      provide: RedisHealth, inject: [REDIS, ReadinessRegistry],
      useFactory: (redis: Redis, readiness: ReadinessRegistry) => new RedisHealth(redis, readiness),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Redis');
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onModuleInit(): void {
    // Error events provide rate-limited visibility while ioredis continues reconnecting.
    void this.redis.connect().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await withTimeout(async (signal) => {
        if (this.redis.status === 'end') return;
        const ended = once(this.redis, 'end', { signal });
        const abort = () => { this.redis.disconnect(); };
        signal.addEventListener('abort', abort, { once: true });
        try { await Promise.all([this.redis.quit(), ended]); }
        finally { signal.removeEventListener('abort', abort); }
      }, 1500);
    } catch {
      this.logger.warn('Redis quit unavailable; disconnecting');
    } finally {
      this.redis.disconnect();
    }
  }
}
