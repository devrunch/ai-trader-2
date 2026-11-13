import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { RedisSourceHealth } from './health';

/** In-memory stand-in for the few Redis commands the health store uses. */
function fakeRedis(): Redis {
  const hashes = new Map<string, Record<string, string>>();
  const numbers = new Map<string, number>();
  const api = {
    hset: (key: string, values: Record<string, string>) => { hashes.set(key, { ...hashes.get(key), ...values }); return Promise.resolve(1); },
    hgetall: (key: string) => Promise.resolve(hashes.get(key) ?? {}),
    mget: (keys: string[]) => Promise.resolve(keys.map(key => (numbers.has(key) ? String(numbers.get(key)) : null))),
    multi: () => {
      const ops: Array<() => void> = [];
      const chain = {
        hset: (key: string, values: Record<string, string>) => { ops.push(() => { hashes.set(key, { ...hashes.get(key), ...values }); }); return chain; },
        incrby: (key: string, n: number) => { ops.push(() => { numbers.set(key, (numbers.get(key) ?? 0) + n); }); return chain; },
        incr: (key: string) => { ops.push(() => { numbers.set(key, (numbers.get(key) ?? 0) + 1); }); return chain; },
        expire: () => chain,
        exec: () => { ops.forEach(op => { op(); }); return Promise.resolve([]); },
      };
      return chain;
    },
  };
  return api as unknown as Redis;
}

const HOUR = 3_600_000;

describe('RedisSourceHealth', () => {
  it('records the last success with its latency', async () => {
    let now = Date.parse('2026-11-12T10:00:00Z');
    const health = new RedisSourceHealth(fakeRedis(), () => now);
    await health.success('rss-a', { items: 0, latencyMs: 120 });
    now += 1000;
    expect((await health.read(['rss-a']))['rss-a']).toMatchObject({ lastSuccessAt: '2026-11-12T10:00:00.000Z', lastLatencyMs: 120, lastError: null });
  });

  it('records the last failure with its time', async () => {
    const health = new RedisSourceHealth(fakeRedis(), () => Date.parse('2026-11-12T10:00:00Z'));
    await health.failure('rss-a', 'HTTP 503');
    expect((await health.read(['rss-a']))['rss-a']).toMatchObject({ lastError: 'HTTP 503', lastErrorAt: '2026-11-12T10:00:00.000Z', lastSuccessAt: null });
  });

  it('truncates a long error message to 300 characters', async () => {
    const health = new RedisSourceHealth(fakeRedis());
    await health.failure('rss-a', 'x'.repeat(500));
    expect((await health.read(['rss-a']))['rss-a']?.lastError).toHaveLength(300);
  });

  it('adds items without changing latency or the last success', async () => {
    const health = new RedisSourceHealth(fakeRedis(), () => 0);
    await health.success('rss-a', { items: 0, latencyMs: 90 });
    await health.items('rss-a', 25);
    expect((await health.read(['rss-a']))['rss-a']).toMatchObject({ items24h: 25, lastLatencyMs: 90 });
  });

  it('sums items and rate-limit hits over the last 24 hours only', async () => {
    let now = 100 * HOUR;
    const health = new RedisSourceHealth(fakeRedis(), () => now);
    await health.success('s', { items: 10, latencyMs: 1 });
    now += 5 * HOUR;
    await health.success('s', { items: 7, latencyMs: 1 });
    await health.rateLimited('s');
    await health.rateLimited('s');
    now += 19 * HOUR;
    const record = (await health.read(['s']))['s'];
    expect(record).toMatchObject({ items24h: 7, rateLimitHits24h: 2 });
  });

  it('keeps sources apart', async () => {
    const health = new RedisSourceHealth(fakeRedis(), () => 0);
    await health.rateLimited('a');
    const read = await health.read(['a', 'b']);
    expect(read['a']?.rateLimitHits24h).toBe(1);
    expect(read['b']).toMatchObject({ rateLimitHits24h: 0, items24h: 0, lastSuccessAt: null });
  });

  it('never throws when Redis fails, and reads an empty record', async () => {
    const broken = { hset: () => Promise.reject(new Error('down')), hgetall: () => Promise.reject(new Error('down')), multi: () => { throw new Error('down'); } } as unknown as Redis;
    const health = new RedisSourceHealth(broken);
    await expect(health.success('a', { items: 1, latencyMs: 1 })).resolves.toBeUndefined();
    await expect(health.failure('a', 'x')).resolves.toBeUndefined();
    await expect(health.rateLimited('a')).resolves.toBeUndefined();
    await expect(health.items('a', 1)).resolves.toBeUndefined();
    expect((await health.read(['a']))['a']).toMatchObject({ items24h: 0, lastSuccessAt: null });
  });
});
