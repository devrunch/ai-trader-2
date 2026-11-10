import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../src/shared/database/schema';
import { DrizzleInstrumentRepository } from '../src/modules/instruments/infrastructure/drizzle-instrument.repository';
import { RefreshInstruments, ResolveInstrument, type RefreshReport, type ResolvedInstrument } from '../src/modules/instruments/application';
import type { SourceSnapshot } from '../src/modules/instruments/application/ports/instrument-source';
import type { InstrumentSource } from '../src/modules/instruments/application/ports/instrument-source';
import { instrument, index } from '../src/modules/instruments/application/instruments.spec-helper';
import { startPostgres } from './support/containers';
import { KiteSource } from '../src/modules/instruments/infrastructure/sources/kite/kite.source';
import { RefreshJob } from '../src/modules/instruments/infrastructure/refresh.job';
import { ReadinessRegistry } from '../src/shared/health';
import type { JobSpec } from '../src/shared/jobs';
import { Redis } from 'ioredis';
import { RedisRefreshLock } from '../src/modules/instruments/infrastructure/redis-refresh-lock';
import { startRedis } from './support/containers';

describe('FR-SY-2/3/4, E23, NFR-RB-4 Postgres master', () => {
  let container: Awaited<ReturnType<typeof startPostgres>>;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repo: DrizzleInstrumentRepository;
  let redisContainer: Awaited<ReturnType<typeof startRedis>>;
  let redis: Redis;
  let snapshot: SourceSnapshot;
  const clock = () => new Date('2026-11-09T01:00:00Z');
  const run = (): Promise<RefreshReport> => new RefreshInstruments(repo, [{ name: 'kite', identity: mappings => new KiteSource().identity(mappings), fetch: () => Promise.resolve(snapshot) }], index(), clock).execute(new AbortController().signal);
  beforeAll(async () => {
    container = await startPostgres();
    redisContainer = await startRedis(); redis = new Redis(redisContainer.url, { maxRetriesPerRequest: 1, commandTimeout: 1500 });
    pool = new Pool({ connectionString: container.url, connectionTimeoutMillis: 3000, options: '-c statement_timeout=10000' });
    db = drizzle(pool, { schema }); repo = new DrizzleInstrumentRepository(db, clock);
    await migrate(db, { migrationsFolder: './drizzle' });
  });
  beforeEach(async () => {
    await db.execute(sql`truncate instrument_mappings, instruments, instrument_changes, instrument_source_status restart identity cascade`);
    snapshot = { instruments: [instrument()], mappings: [{ id: 'NSE:OLD', provider: 'kite', providerSymbol: 'OLD', providerToken: '1/2' }] };
  });
  afterAll(async () => { await redis.quit(); await redisContainer.stop(); await pool.end(); await container.stop(); });
  it('refresh stores instruments and mappings', async () => {
    await run(); expect(await repo.loadSource('kite')).toEqual(snapshot);
    expect(await db.select().from(schema.instrumentSourceStatus)).toMatchObject([{ source: 'kite', status: 'ok', instrumentCount: 1 }]);
  });
  it('lists source status rows for the admin view (FR-AC-2)', async () => {
    await repo.setSourceStatus('kite', { status: 'ok', count: 7, at: '2026-11-09T01:00:00.000Z' });
    await repo.setSourceStatus('deriv', { status: 'stale', reason: 'source down', at: '2026-11-09T01:05:00.000Z' });
    const rows = await repo.listSourceStatus();
    expect(rows).toEqual([
      { source: 'deriv', status: 'stale', reason: 'source down', count: 0, lastSuccessAt: null },
      { source: 'kite', status: 'ok', reason: null, count: 7, lastSuccessAt: expect.stringMatching(/^2026-11-09T01:00:00(\.000)?(Z|\+00:00)$/) as string },
    ]);
  });
  it('concurrent refreshes run once and both callers get the report (NFR-RB-4/5)', async () => {
    let finishFetch: (() => void) | undefined;
    let fetchStarted: (() => void) | undefined;
    const started = new Promise<void>(resolve => { fetchStarted = resolve; });
    const gate = new Promise<void>(resolve => { finishFetch = resolve; });
    const fetchSource = vi.fn(async () => { fetchStarted?.(); await gate; return { instruments: [instrument()], mappings: [] }; });
    const source: InstrumentSource = { name: 'kite', fetch: fetchSource };
    const refresh = new RefreshInstruments(repo, [source], index(), clock, console, new RedisRefreshLock(redis));
    const first = refresh.execute(new AbortController().signal);
    await started;
    const second = refresh.execute(new AbortController().signal);
    await new Promise(resolve => setTimeout(resolve, 50));
    finishFetch?.();
    const [left, right] = await Promise.all([first, second]);
    expect(fetchSource).toHaveBeenCalledTimes(1);
    expect(left).toEqual(right);
  });
  it('registers the daily durable job and requests bootstrap refresh without blocking boot', async () => {
    const scheduler = { register: vi.fn<(spec: JobSpec) => Promise<void>>().mockResolvedValue(undefined),
      runNow: vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined) };
    const refresh = new RefreshInstruments(repo, [], index(), clock);
    const execute = vi.spyOn(refresh, 'execute').mockResolvedValue({ sources: {} });
    const readiness = new ReadinessRegistry();
    const job = new RefreshJob(scheduler, refresh, db, readiness);
    job.onApplicationBootstrap();
    await vi.waitFor(() => { expect(scheduler.runNow).toHaveBeenCalledExactlyOnceWith('instruments-refresh'); });
    const spec = scheduler.register.mock.calls[0]?.[0]; if (!spec) throw new Error('Job missing');
    expect(spec).toMatchObject({ name: 'instruments-refresh', cron: '0 7 * * *', tz: 'Asia/Kolkata', graceMs: 21600000, maxRuntimeMs: 600000 });
    const signal = new AbortController().signal; await spec.run(signal); expect(execute).toHaveBeenCalledWith(signal);
    await repo.setSourceStatus('kite', { status: 'stale', reason: 'provider unavailable', at: clock().toISOString() });
    expect((await readiness.runAll()).checks['instruments:kite']).toEqual({ status: 'down', reason: 'provider unavailable' });
    await repo.setSourceStatus('kite', { status: 'ok', count: 1, at: clock().toISOString() });
    expect((await readiness.runAll()).checks['instruments:kite']).toEqual({ status: 'up' });
  });
  it('refresh is atomic per source and idempotent', async () => {
    await run(); const rows = await db.select().from(schema.instruments); const changes = await db.select().from(schema.instrumentChanges);
    await run(); expect(await db.select().from(schema.instruments)).toEqual(rows);
    expect(await db.select().from(schema.instrumentChanges)).toEqual(changes);
    // The trigger rejects the second batch, after the first batch has been inserted.
    await db.execute(sql`create function fail_master_batch() returns trigger language plpgsql as $$ begin if NEW.ticker = 'FAIL' then raise exception 'batch failed'; end if; return NEW; end $$`);
    await db.execute(sql`create trigger fail_master before insert on instruments for each row execute function fail_master_batch()`);
    try {
      snapshot = { instruments: [...Array.from({ length: 1000 }, (_, i) => instrument(`NSE:B${String(i)}`)), instrument('NSE:FAIL')], mappings: [] };
      expect((await run()).sources.kite?.status).toBe('stale');
      expect(await db.select().from(schema.instruments)).toEqual(rows);
      expect(await db.select().from(schema.instrumentChanges)).toEqual(changes);
    } finally {
      await db.execute(sql`drop trigger fail_master on instruments`);
      await db.execute(sql`drop function fail_master_batch()`);
    }
  });
  it('renames are recorded and the old id keeps its row as delisted', async () => {
    await run(); snapshot = { instruments: [instrument('NSE:NEW')], mappings: [{ id: 'NSE:NEW', provider: 'kite', providerSymbol: 'NEW', providerToken: '1/3' }] };
    await run(); await run();
    expect((await repo.findById('NSE:OLD'))?.status).toBe('delisted');
    expect(await repo.findRenameSuccessor('NSE:OLD')).toBe('NSE:NEW');
    const resolved: ResolvedInstrument = await new ResolveInstrument(repo, index()).execute('NSE:OLD');
    expect(resolved.instrument.id.toString()).toBe('NSE:NEW');
    expect((await db.select().from(schema.instrumentChanges)).map(row => row.kind)).toEqual(['listed', 'renamed']);
    expect((await repo.loadSource('kite')).mappings).toEqual(snapshot.mappings);
  });
  it('mappings are unique per provider symbol', async () => {
    snapshot.instruments.push(instrument('NSE:SECOND'));
    snapshot.mappings.push({ id: 'NSE:SECOND', provider: 'kite', providerSymbol: 'OLD' });
    expect((await run()).sources.kite?.status).toBe('stale');
    expect(await db.select().from(schema.instruments)).toEqual([]);
  });
  it('purges only old expired derivatives and retains change history', async () => {
    snapshot = { instruments: [instrument('MCX:GOLD', { type: 'commodity', expiry: '2026-09-01' }), instrument('NSE:STOCK'), instrument('MCX:RECENT', { type: 'futures', expiry: '2026-11-01' })], mappings: [] };
    await run(); snapshot = { instruments: [], mappings: [] }; await run();
    expect(await repo.findById('MCX:GOLD')).toBeNull();
    // FR-SY-7, E23: retained history resolves the reason after physical deletion.
    expect(await repo.findLastChange('MCX:GOLD')).toMatchObject({ kind: 'expired', at: '2026-11-09 01:00:00+00' });
    await expect(new ResolveInstrument(repo, index()).execute('MCX:GOLD')).rejects.toMatchObject({
      code: 'SYMBOL_NOT_FOUND', details: { id: 'MCX:GOLD', reason: 'expired', at: '2026-11-09 01:00:00+00', suggestions: [] },
    });
    expect(await repo.findLastChange('NSE:UNKNOWN')).toBeNull();
    expect((await repo.findById('NSE:STOCK'))?.status).toBe('delisted');
    expect((await repo.listForIndex()).map(row => row.id.toString())).toEqual(['MCX:RECENT']);
    expect((await db.select().from(schema.instrumentChanges)).length).toBe(6);
  });
  // Timed alone by test:perf (vitest.perf.config.mts); the parallel integration run filters it out by name.
  it('refresh of 100,000 instruments completes within 60 seconds', async () => {
    snapshot = { instruments: Array.from({ length: 100000 }, (_, i) => instrument(`NSE:PERF${String(i)}`)), mappings: Array.from({ length: 100000 }, (_, i) => ({ id: `NSE:PERF${String(i)}`, provider: 'kite', providerSymbol: `PERF${String(i)}` })) };
    const started = performance.now(); const report = await run(); const duration = performance.now() - started;
    console.info(`P1-5 100,000 instrument refresh: ${duration.toFixed(0)} ms`);
    expect(report.sources.kite).toMatchObject({ status: 'ok', count: 100000 });
    expect(duration).toBeLessThan(60000);
  }, 65000);
});
