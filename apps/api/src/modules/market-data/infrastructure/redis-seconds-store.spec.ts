import { describe, expect, it } from 'vitest';
import { RedisSecondsStore } from './redis-seconds-store';

type Op = () => void;
function fakeRedis() {
  const sets = new Map<string, Map<number, string>>();
  const published: string[] = [];
  const multi = () => {
    const ops: Op[] = [];
    const chain = {
      zremrangebyscore: (k: string, lo: number, hi: number) => { ops.push(() => { for (const t of [...(sets.get(k)?.keys() ?? [])]) if (t >= lo && t <= hi) sets.get(k)?.delete(t); }); return chain; },
      zadd: (k: string, t: number, v: string) => { ops.push(() => { sets.set(k, (sets.get(k) ?? new Map<number, string>()).set(t, v)); }); return chain; },
      zremrangebyrank: (k: string, _from: number, stop: number) => { ops.push(() => {
        const times = [...(sets.get(k)?.keys() ?? [])].sort((a, b) => a - b);
        for (const t of times.slice(0, Math.max(0, times.length + stop + 1))) sets.get(k)?.delete(t);
      }); return chain; },
      pexpire: () => chain,
      publish: (_c: string, m: string) => { ops.push(() => { published.push(m); }); return chain; },
      exec: () => { ops.forEach(op => { op(); }); return Promise.resolve(ops.map(() => [null, 1])); },
    };
    return chain;
  };
  const zrevrangebyscore = (k: string, max: string, _min: string, _l: string, _o: number, limit: number) => {
    const bound = max === '+inf' ? Infinity : Number(max.slice(1)) - 1;
    const times = [...(sets.get(k)?.keys() ?? [])].filter(t => t <= bound).sort((a, b) => b - a).slice(0, limit);
    return Promise.resolve(times.map(t => sets.get(k)?.get(t) ?? ''));
  };
  return { redis: { multi, zrevrangebyscore } as never, published, sets };
}
const bar = (time: number, close = 1) => ({ time, open: 1, high: 2, low: 0.5, close, volume: 1 });

describe('FR-CH-8 RedisSecondsStore ring', () => {
  it('keeps only the newest cap bars and reads them oldest first', async () => {
    const { redis } = fakeRedis();
    const store = new RedisSecondsStore(redis, 3);
    for (let i = 1; i <= 5; i++) await store.put('NSE:A', '1S', 'closed', bar(i * 1000));
    expect((await store.read('NSE:A', '1S', 10)).map(b => b.time)).toEqual([3000, 4000, 5000]);
  });
  it('replaces the forming bar at the same time and honours limit and before', async () => {
    const { redis } = fakeRedis();
    const store = new RedisSecondsStore(redis, 10);
    await store.put('NSE:A', '5S', 'forming', bar(5000, 1));
    await store.put('NSE:A', '5S', 'forming', bar(5000, 7));
    await store.put('NSE:A', '5S', 'closed', bar(10000));
    expect(await store.read('NSE:A', '5S', 10, 10000)).toEqual([bar(5000, 7)]);
    expect((await store.read('NSE:A', '5S', 1)).map(b => b.time)).toEqual([10000]);
  });
  it('publishes each write', async () => {
    const { redis, published } = fakeRedis();
    await new RedisSecondsStore(redis).put('NSE:A', '1S', 'closed', bar(1000));
    expect(JSON.parse(published[0] ?? '{}')).toEqual({ kind: 'closed', bar: bar(1000) });
  });
});
