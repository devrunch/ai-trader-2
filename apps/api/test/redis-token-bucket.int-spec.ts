import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisTokenBucket } from '../src/shared/redis';
import { startRedis } from './support/containers';

describe('FR-MD-4 E4 shared history rate limit', () => {
  let container: Awaited<ReturnType<typeof startRedis>> | undefined;
  let a: Redis | undefined; let b: Redis | undefined;
  beforeAll(async () => {
    container = await startRedis(); a = new Redis(container.url); b = new Redis(container.url);
    await Promise.all([a.ping(), b.ping()]);
  });
  afterAll(async () => { a?.disconnect(); b?.disconnect(); await container?.stop(); });
  it('limits to 3 per second across two clients', async () => {
    if (!a || !b) throw new Error('Redis clients not started');
    const buckets = [new RedisTokenBucket(a, 'rate', 3, 3), new RedisTokenBucket(b, 'rate', 3, 3)];
    const start = performance.now();
    await Promise.all(Array.from({ length: 9 }, (_, i) => {
      const bucket = buckets[i % 2]; if (!bucket) throw new Error('Missing bucket');
      return bucket.take(AbortSignal.timeout(10000));
    }));
    expect(performance.now() - start).toBeGreaterThanOrEqual(2000);
  });
  it('rejects after maxWaitMs', async () => {
    if (!a) throw new Error('Redis client not started');
    const bucket = new RedisTokenBucket(a, 'slow', 1, 0.1); const signal = AbortSignal.timeout(10000);
    await bucket.take(signal);
    const start = performance.now();
    await expect(bucket.take(signal, 50)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(performance.now() - start).toBeGreaterThanOrEqual(45);
  });
});
