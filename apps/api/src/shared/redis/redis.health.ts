import type { OnModuleInit } from '@nestjs/common';
import { withTimeout } from '@aitrader/resilience';
import { Redis } from 'ioredis';
import { ReadinessRegistry, type ReadinessResult } from '../health';
import { UnavailableError } from '../errors';

export class RedisHealth implements OnModuleInit {
  constructor(private readonly redis: Redis, private readonly readiness: ReadinessRegistry) {}

  onModuleInit(): void {
    this.readiness.register('redis', () => this.check());
  }

  private async check(): Promise<ReadinessResult> {
    try {
      await withTimeout(async (signal) => {
        signal.throwIfAborted();
        await this.redis.ping();
      }, 1000);
      return { status: 'up' };
    } catch {
      return { status: 'down', reason: new UnavailableError('Redis unavailable').message };
    }
  }
}
