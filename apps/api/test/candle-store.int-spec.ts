import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { DrizzleCandleStore } from '../src/modules/market-data/infrastructure/drizzle-candle-store';
import { RedisFormingBarStore } from '../src/modules/market-data/infrastructure/redis-forming-bar-store';
import { RetentionJob } from '../src/modules/market-data/infrastructure/retention.job';
import { PartitionJob } from '../src/modules/market-data/infrastructure/partition.job';
import { ReadinessRegistry } from '../src/shared/health';
import type { JobSpec } from '../src/shared/jobs';
import { ReadBars } from '../src/modules/market-data/application/read-bars';
import { calendarFor } from '../src/modules/market-data/domain/calendar';
import type { Bar } from '../src/modules/market-data/domain/bar';
import { startPostgres, startRedis } from './support/containers';

const bar = (date: string, close = 10): Bar => ({ time: Date.parse(date), open: 10, high: 12, low: 9, close, volume: null });
describe('FR-MD-2 NFR-RB-4 NFR-PF-2 Q5 candle storage', () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  let cache: Awaited<ReturnType<typeof startRedis>>;
  let pool: Pool;
  let redis: Redis;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let store: DrizzleCandleStore;
  let forming: RedisFormingBarStore;
  beforeAll(async () => {
    [postgres, cache] = await Promise.all([startPostgres(), startRedis()]);
    pool = new Pool({ connectionString: postgres.url, connectionTimeoutMillis: 3000, options: '-c statement_timeout=5000' });
    redis = new Redis(cache.url, { commandTimeout: 3000 });
    db = drizzle(pool, { schema }); await migrate(db, { migrationsFolder: './drizzle' });
    store = new DrizzleCandleStore(db); forming = new RedisFormingBarStore(redis);
  });
  beforeEach(async () => { await db.execute(sql`truncate bars_1m, bars_1d`); await redis.flushdb(); });
  afterAll(async () => { await redis.quit(); await pool.end(); await Promise.all([postgres.stop(), cache.stop()]); });
  it('upsert is idempotent', async () => {
    for (const write of [store.upsert1m.bind(store), store.upsert1d.bind(store)]) {
      expect(await write('NSE:TEST', [bar('2026-11-09T03:45:00Z')], 'test')).toEqual({ written: 1, repaired: 0 });
      expect(await write('NSE:TEST', [bar('2026-11-09T03:45:00Z')], 'test')).toEqual({ written: 0, repaired: 0 });
    }
  });
  it('latest1m returns the newest stored minute, or null (E7)', async () => {
    expect(await store.latest1m('NSE:EMPTY')).toBeNull();
    await store.upsert1m('NSE:LATEST', [bar('2026-11-09T03:45:00Z'), bar('2026-11-09T07:35:00Z'), bar('2026-11-09T05:00:00Z')], 'test');
    expect(await store.latest1m('NSE:LATEST')).toBe(Date.parse('2026-11-09T07:35:00Z'));
  });
  it('instrumentsWith1m lists instruments with bars in the window (daily data report)', async () => {
    await store.upsert1m('NSE:COVA', [bar('2026-11-10T04:00:00Z')], 'test');
    await store.upsert1m('NSE:COVB', [bar('2026-11-12T04:00:00Z')], 'test');
    const ids = await store.instrumentsWith1m(Date.parse('2026-11-10T00:00:00Z'), Date.parse('2026-11-11T00:00:00Z'));
    expect(ids).toContain('NSE:COVA');
    expect(ids).not.toContain('NSE:COVB');
  });
  it('a changed vendor bar marks repaired', async () => {
    await store.upsert1m('NSE:TEST', [bar('2026-11-09T03:45:00Z')], 'test');
    expect(await store.upsert1m('NSE:TEST', [bar('2026-11-09T03:45:00Z', 11)], 'test')).toEqual({ written: 1, repaired: 1 });
    expect((await store.range1m('NSE:TEST', 0, Date.parse('2027-01-01')))[0]?.repaired).toBe(true);
  });
  it('round-trips daily starts in exchange timezones and preserves repair flags', async () => {
    for (const [id, at] of [['NSE:TEST', '2026-11-08T18:30:00Z'], ['NYSE:TEST', '2026-11-09T05:00:00Z'], ['FX:TEST', '2026-11-09T22:00:00Z']]) {
      if (!id || !at) throw new Error('Missing daily fixture');
      await store.upsert1d(id, [bar(at)], 'test');
      expect(await store.earliest(id, true)).toBe(Date.parse(at));
      expect(await store.range1d(id, '2026-11-09', '2026-11-10')).toEqual([{ ...bar(at), repaired: false }]);
      expect(await store.upsert1d(id, [bar(at, 11)], 'test')).toEqual({ written: 1, repaired: 1 });
      expect(await store.upsert1d(id, [bar(at, 11)], 'test')).toEqual({ written: 0, repaired: 0 });
    }
  });
  it('writes into a month with no partition by creating it', async () => {
    await store.upsert1m('NSE:TEST', [bar('2020-01-01T00:00:00Z')], 'test');
    expect((await db.execute(sql`select to_regclass('bars_1m_202001') as name`)).rows).toEqual([{ name: 'bars_1m_202001' }]);
  });
  it('serializes concurrent writers creating the same missing partition', async () => {
    const bars = [bar('2034-10-01T00:00:00Z')];
    expect(await Promise.all(['NSE:A', 'NSE:B'].map(id => store.upsert1m(id, bars, 'test'))))
      .toEqual([{ written: 1, repaired: 0 }, { written: 1, repaired: 0 }]);
  });
  it('retention drops partitions older than 24 months', async () => {
    await store.upsert1m('NSE:TEST', [bar('2024-10-01T00:00:00Z'), bar('2024-11-01T00:00:00Z')], 'test');
    await new RetentionJob(db, () => new Date('2026-11-09T00:00:00Z')).run();
    expect((await db.execute(sql`select to_regclass('bars_1m_202410') as old, to_regclass('bars_1m_202411') as kept`)).rows)
      .toEqual([{ old: null, kept: 'bars_1m_202411' }]);
    await new RetentionJob(db, () => new Date('2026-11-09T00:00:00Z')).run();
  });
  it('creates three partitions at boot and registers idempotent IST jobs', async () => {
    const scheduler = { register: vi.fn<(spec: JobSpec) => Promise<void>>().mockResolvedValue(undefined) };
    const ready = new ReadinessRegistry();
    const job = new PartitionJob(db, scheduler, ready, () => new Date('2026-12-31T19:30:00Z'));
    job.onApplicationBootstrap();
    await vi.waitFor(async () => { expect((await ready.runAll()).ok).toBe(true); });
    expect(scheduler.register.mock.calls[0]?.[0]).toMatchObject({ name: 'bars-partitions', cron: '0 1 1 * *', tz: 'Asia/Kolkata' });
    await job.run();
    expect((await db.execute(sql`select to_regclass('bars_1m_202701') as a, to_regclass('bars_1m_202702') as b, to_regclass('bars_1m_202703') as c`)).rows)
      .toEqual([{ a: 'bars_1m_202701', b: 'bars_1m_202702', c: 'bars_1m_202703' }]);
    new RetentionJob(db, undefined, scheduler).onApplicationBootstrap();
    const spec = scheduler.register.mock.calls[1]?.[0];
    expect(spec).toMatchObject({ name: 'bars-retention', cron: '0 2 * * *', tz: 'Asia/Kolkata' });
    await spec?.run(new AbortController().signal);
  });
  it('rejects aborted storage calls and malformed Redis snapshots visibly', async () => {
    const signal = AbortSignal.abort();
    await expect(store.range1m('NSE:TEST', 0, 1, signal)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(forming.get('NSE:TEST', signal)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await redis.hset('bar:forming:NSE:TEST', 'value', '{}');
    await expect(forming.get('NSE:TEST')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('range1m spans a partition boundary', async () => {
    const bars = [bar('2026-10-31T23:59:00Z'), bar('2026-11-01T00:00:00Z')];
    await store.upsert1m('NSE:TEST', bars, 'test');
    expect(await store.range1m('NSE:TEST', bars[0]?.time ?? 0, Date.parse('2026-11-01T00:01:00Z'))).toEqual(bars.map(b => ({ ...b, repaired: false })));
  });
  it('forming bar round-trips through Redis with TTL', async () => {
    const value = { bar: bar('2026-11-09T03:45:00Z'), lastCumVolume: 42, seq: 5 };
    await forming.set('NSE:TEST', value); expect(await forming.get('NSE:TEST')).toEqual(value);
    expect(await redis.type('bar:forming:NSE:TEST')).toBe('hash');
    expect(await redis.ttl('bar:forming:NSE:TEST')).toBeGreaterThanOrEqual(172799);
    await forming.clear('NSE:TEST'); expect(await forming.get('NSE:TEST')).toBeNull();
  });
  it('reads 5,000 5m bars within 800 ms', async () => {
    const bars: Bar[] = []; const cal = calendarFor('NSE');
    for (let day = Date.parse('2026-06-01'); bars.length < 25500; day += 86400000) {
      const date = new Date(day).toISOString().slice(0, 10);
      for (const session of cal.sessionsOn(date)) for (let time = session.open; time < session.close; time += 60000) bars.push({ ...bar(date), time });
    }
    await store.upsert1m('NSE:TEST', bars.slice(0, 22500), 'test');
    const sixtyDayRead = new ReadBars(store, forming, () => (bars[22499]?.time ?? 0) + 60000);
    const sixtyDayStart = performance.now();
    const sixtyDayPage = await sixtyDayRead.execute('NSE:TEST', '5', { latest: true }, 5000);
    const sixtyDayDuration = performance.now() - sixtyDayStart;
    if (!('bars' in sixtyDayPage)) throw new Error(sixtyDayPage.reason);
    console.info(`NFR-PF-2 60 sessions / 22500 minutes / 4500 bars: ${sixtyDayDuration.toFixed(2)} ms`);
    expect(sixtyDayPage.bars).toHaveLength(4500); expect(sixtyDayPage.complete).toBe(false);
    expect(sixtyDayDuration).toBeLessThanOrEqual(800);
    await store.upsert1m('NSE:TEST', bars.slice(22500), 'test');
    const read = new ReadBars(store, forming, () => (bars.at(-1)?.time ?? 0) + 60000);
    const begin = performance.now(); const page = await read.execute('NSE:TEST', '5', { latest: true }, 5000);
    const duration = performance.now() - begin;
    if (!('bars' in page)) throw new Error(page.reason);
    console.info(`NFR-PF-2 5000 bars: ${duration.toFixed(2)} ms; seeded ${String(bars.length)} minutes`);
    expect(page.bars).toHaveLength(5000); expect(duration).toBeLessThanOrEqual(800);
  });
});
