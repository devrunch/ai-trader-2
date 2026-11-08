import { Inject, Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { DB, type Database } from '../../shared/database';
import { REDIS, RedisTokenBucket } from '../../shared/redis';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { KiteModule, KiteSessionService } from '../../shared/vendors/kite';
import { InstrumentHistory } from '../instruments/application/index';
import { JobScheduler } from '../../shared/jobs';
import { ReadinessRegistry, type ReadinessResult } from '../../shared/health';
import { ReadBars } from './application';
import { DrizzleCandleStore } from './infrastructure/drizzle-candle-store';
import { RedisFormingBarStore } from './infrastructure/redis-forming-bar-store';
import { PartitionJob } from './infrastructure/partition.job';
import { RetentionJob } from './infrastructure/retention.job';
import { FillHistory } from './application/fill-history';
import { BackfillHeld } from './application/backfill-held';
import { MARKET_DATA_PROVIDERS, type MarketDataProvider } from './application/ports/market-data-provider';
import { KiteHistoryProvider } from './infrastructure/kite/kite-history.provider';
import { BackfillJob } from './infrastructure/backfill.job';
import { LiveBars } from './application/live-bars';
import { KiteTickerFeed } from './infrastructure/kite/kite-ticker.feed';

@Module({
  imports: [KiteModule],
  providers: [
    { provide: KiteTickerFeed, inject: [KiteSessionService, InstrumentHistory, FillHistory, DrizzleCandleStore, APP_CONFIG],
      useFactory: (session: KiteSessionService, instruments: InstrumentHistory, fill: FillHistory, store: DrizzleCandleStore, config: AppConfig) => {
        const logger = new Logger('KiteTicker');
        return new KiteTickerFeed({ session, instruments, fill, store, apiKey: config.ZERODHA_API_KEY ?? '',
          log: (reason, error) => { logger.warn({ reason, code: error instanceof Error ? error.name : 'UNKNOWN' }); } });
      } },
    { provide: LiveBars, inject: [DrizzleCandleStore, RedisFormingBarStore],
      useFactory: (store: DrizzleCandleStore, forming: RedisFormingBarStore) => {
        const logger = new Logger('LiveBars');
        return new LiveBars(store, forming, { clock: Date.now, log: reason => { logger.warn(reason); } });
      } },
    { provide: RedisTokenBucket, inject: [REDIS], useFactory: (redis: Redis) => new RedisTokenBucket(redis, 'rl:kite:history', 3, 3) },
    { provide: KiteHistoryProvider, inject: [KiteSessionService, RedisTokenBucket, APP_CONFIG],
      useFactory: (session: KiteSessionService, bucket: RedisTokenBucket, config: AppConfig) =>
        new KiteHistoryProvider(session, bucket, config.ZERODHA_API_KEY ?? '') },
    { provide: MARKET_DATA_PROVIDERS, inject: [KiteHistoryProvider],
      useFactory: (kite: KiteHistoryProvider) => new Map<string, MarketDataProvider>([['kite', kite]]) },
    { provide: FillHistory, inject: [DrizzleCandleStore, InstrumentHistory, MARKET_DATA_PROVIDERS],
      useFactory: (store: DrizzleCandleStore, instruments: InstrumentHistory, providers: Map<string, MarketDataProvider>) =>
        new FillHistory(store, instruments, providers) },
    { provide: BackfillHeld, inject: [FillHistory, InstrumentHistory], useFactory: (fill: FillHistory, instruments: InstrumentHistory) => {
      const logger = new Logger('BarsBackfill');
      return new BackfillHeld(fill, instruments, Date.now, { info: value => { logger.log(value); } });
    } },
    { provide: BackfillJob, inject: [JobScheduler, BackfillHeld, KiteTickerFeed],
      useFactory: (scheduler: JobScheduler, backfill: BackfillHeld, feed: KiteTickerFeed) => new BackfillJob(scheduler, backfill, signal => feed.retryBackfills(signal)) },
    { provide: DrizzleCandleStore, inject: [DB], useFactory: (db: Database) => new DrizzleCandleStore(db) },
    { provide: RedisFormingBarStore, inject: [REDIS], useFactory: (redis: Redis) => new RedisFormingBarStore(redis) },
    { provide: ReadBars, inject: [DrizzleCandleStore, RedisFormingBarStore, FillHistory],
      useFactory: (store: DrizzleCandleStore, forming: RedisFormingBarStore, fill: FillHistory) => new ReadBars(store, forming, Date.now, fill) },
    { provide: PartitionJob, inject: [DB, JobScheduler, ReadinessRegistry],
      useFactory: (db: Database, jobs: JobScheduler, ready: ReadinessRegistry) => new PartitionJob(db, jobs, ready) },
    { provide: RetentionJob, inject: [DB, JobScheduler], useFactory: (db: Database, jobs: JobScheduler) => new RetentionJob(db, undefined, jobs) },
  ],
  exports: [ReadBars, KiteTickerFeed],
})
export class MarketDataModule {
  private detach: (() => void) | undefined;
  private feedStatus: ReadinessResult = { status: 'down', reason: 'connecting' };
  constructor(@Inject(KiteTickerFeed) private readonly kite: KiteTickerFeed, @Inject(LiveBars) private readonly bars: LiveBars,
    @Inject(ReadinessRegistry) private readonly readiness: ReadinessRegistry) {}
  // P2-9 calls this explicitly; constructing the API module never opens a feed.
  async startFeeds(): Promise<void> {
    if (!this.detach) {
      this.readiness.register('kite-ticker', () => Promise.resolve(this.feedStatus));
      const offState = this.kite.onState((state, reason) => {
        this.feedStatus = state === 'live' ? { status: 'up' } : { status: 'down', reason: reason ?? state };
      });
      const offBars = this.bars.attach(this.kite);
      this.detach = () => { offState(); offBars(); };
    }
    await this.kite.start();
  }
  async onModuleDestroy(): Promise<void> { await this.kite.stop(); this.detach?.(); this.detach = undefined; }
}
