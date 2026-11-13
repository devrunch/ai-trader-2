import { Inject, Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { DB, type Database } from '../../shared/database';
import { REDIS, RedisTokenBucket } from '../../shared/redis';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { KiteModule, KiteSessionService } from '../../shared/vendors/kite';
import { InstrumentHistory } from '../instruments/application/index';
import { JobScheduler } from '../../shared/jobs';
import { ReadinessRegistry, type ReadinessResult } from '../../shared/health';
import { IpRateLimitGuard } from '../../shared/http';
import { ResolveInstrument } from '../instruments/application/index';
import { GetQuote, MarketDataService, ReadBars, StoredBars } from './application';
import { DrizzleStoredBarsReader } from './infrastructure/drizzle-stored-bars.reader';
import { MarketDataController } from './api/market-data.controller';
import { DepthController } from './api/depth.controller';
import { AuthModule } from '../auth/auth.module';
import { ReadDepth } from './application/read-depth';
import { RecordDepth } from './application/record-depth';
import { RedisDepthStore } from './infrastructure/redis-depth-store';
import { SourceRegistry } from '../../shared/sources';
import { MARKET_DATA_DESCRIPTORS } from './infrastructure/sources/descriptors';
import { RedisFeedStateStore } from './infrastructure/feed-state.store';
import { RedisFeedLeadership } from './infrastructure/process/redis-feed-leadership';
import { GetFeedOverview } from './application/get-feed-overview';
import { CheckSessionCoverage } from './application/check-session-coverage';
import { DrizzleCandleStore } from './infrastructure/drizzle-candle-store';
import { RedisFormingBarStore } from './infrastructure/redis-forming-bar-store';
import { PartitionJob } from './infrastructure/partition.job';
import { RetentionJob } from './infrastructure/retention.job';
import { FillHistory } from './application/fill-history';
import { BackfillHeld } from './application/backfill-held';
import { MARKET_DATA_PROVIDERS, type MarketDataProvider } from './application/ports/market-data-provider';
import { KiteHistoryProvider } from './infrastructure/kite/kite-history.provider';
import { KitePreviousCloseSource } from './infrastructure/kite/kite-previous-close.source';
import { RedisPreviousCloseStore } from './infrastructure/redis-previous-close.store';
import { BackfillJob } from './infrastructure/backfill.job';
import { LiveBars } from './application/live-bars';
import { KiteTickerFeed } from './infrastructure/kite/kite-ticker.feed';
import { DerivFeed } from './infrastructure/deriv/deriv.feed';
import { DerivHistoryProvider } from './infrastructure/deriv/deriv-history.provider';
import { UsDelayedProvider } from './infrastructure/us/us-delayed.provider';
import { UsDelayedFeed } from './infrastructure/us/us-delayed.feed';
import { RequestSubscription } from './application/request-subscription';
import { RedisSubscriptionLeases } from './infrastructure/redis-subscription-leases';
import { RedisSecondsDemand, RedisSecondsLeases } from './infrastructure/redis-seconds-demand';
import { RedisSecondsStore } from './infrastructure/redis-seconds-store';
import { SecondsBars } from './application/seconds-bars';
import { z } from 'zod';
import { RedisBarPublisher } from './infrastructure/redis-bar-publisher';
import { RedisBarSequenceStore } from './infrastructure/redis-bar-sequence-store';
import { ReadSeq } from './application/read-seq';
import { AggregateLiveBars } from './application/aggregate-live-bars';
import type { BarPublisher } from './application/ports/bar-publisher';

const BarPublisherToken = 'BAR_PUBLISHER';

@Module({
  imports: [KiteModule],
  providers: [
    { provide: 'MARKET_DATA_SOURCE_DESCRIPTORS', inject: [SourceRegistry], useFactory: (registry: SourceRegistry) => { registry.register(...MARKET_DATA_DESCRIPTORS); return MARKET_DATA_DESCRIPTORS; } },
    { provide: IpRateLimitGuard, useFactory: () => new IpRateLimitGuard(60, 20) },
    { provide: RedisFeedStateStore, inject: [REDIS], useFactory: (redis: Redis) => new RedisFeedStateStore(redis) },
    { provide: CheckSessionCoverage, inject: [DrizzleCandleStore, FillHistory], useFactory: (store: DrizzleCandleStore, fill: FillHistory) => new CheckSessionCoverage(store, fill) },
    { provide: GetFeedOverview, inject: [RedisFeedStateStore, REDIS], useFactory: (states: RedisFeedStateStore, redis: Redis) => new GetFeedOverview(states, new RedisFeedLeadership(redis)) },
    { provide: RedisSubscriptionLeases, inject: [REDIS, APP_CONFIG], useFactory: (redis: Redis, config: AppConfig) => new RedisSubscriptionLeases(redis, config.API_INSTANCE_ID) },
    { provide: RedisSecondsLeases, inject: [REDIS, APP_CONFIG], useFactory: (redis: Redis, config: AppConfig) => new RedisSecondsLeases(redis, config.API_INSTANCE_ID) },
    { provide: RequestSubscription, inject: [RedisSubscriptionLeases, RedisSecondsLeases],
      useFactory: (leases: RedisSubscriptionLeases, seconds: RedisSecondsLeases) => new RequestSubscription(leases, seconds) },
    { provide: RedisSecondsStore, inject: [REDIS], useFactory: (redis: Redis) => new RedisSecondsStore(redis) },
    { provide: SecondsBars, inject: [RedisSecondsStore, REDIS], useFactory: (store: RedisSecondsStore, redis: Redis) => {
      const logger = new Logger('SecondsBars');
      return new SecondsBars(store, new RedisSecondsDemand(redis), { clock: Date.now, log: (reason, error) => { logger.warn({ reason, code: error instanceof Error ? error.name : 'UNKNOWN' }); } });
    } },
    { provide: MarketDataService, inject: [ResolveInstrument, ReadBars, RedisFeedStateStore],
      useFactory: (resolve: ResolveInstrument, read: ReadBars, feeds: RedisFeedStateStore) => new MarketDataService(resolve, read, feeds) },
    { provide: RedisPreviousCloseStore, inject: [REDIS], useFactory: (redis: Redis) => new RedisPreviousCloseStore(redis) },
    // Kite quote endpoints allow about 1 request a second; a separate bucket keeps history calls unaffected.
    { provide: KitePreviousCloseSource, inject: [KiteSessionService, InstrumentHistory, REDIS, APP_CONFIG],
      useFactory: (session: KiteSessionService, instruments: InstrumentHistory, redis: Redis, config: AppConfig) =>
        new KitePreviousCloseSource(session, instruments, new RedisTokenBucket(redis, 'rl:kite:quote', 1, 1), config.ZERODHA_API_KEY ?? '') },
    { provide: GetQuote, inject: [MarketDataService, DrizzleCandleStore, RedisFormingBarStore, RedisPreviousCloseStore, KitePreviousCloseSource],
      useFactory: (market: MarketDataService, store: DrizzleCandleStore, forming: RedisFormingBarStore, prevCloses: RedisPreviousCloseStore, source: KitePreviousCloseSource) =>
        new GetQuote(market, store, forming, { store: prevCloses, source }) },
    { provide: DerivHistoryProvider, useFactory: () => new DerivHistoryProvider() },
    { provide: UsDelayedProvider, useFactory: () => new UsDelayedProvider() },
    { provide: UsDelayedFeed, inject: [UsDelayedProvider, InstrumentHistory],
      useFactory: (provider: UsDelayedProvider, instruments: InstrumentHistory) => new UsDelayedFeed({ provider, instruments }) },
    { provide: DerivFeed, inject: [InstrumentHistory, FillHistory, DrizzleCandleStore],
      useFactory: (instruments: InstrumentHistory, fill: FillHistory, store: DrizzleCandleStore) => {
        const logger = new Logger('Deriv');
        return new DerivFeed({ instruments, fill, store,
          log: (reason, error) => { logger.warn({ reason, code: error instanceof Error ? error.name : 'UNKNOWN' }); } });
      } },
    { provide: KiteTickerFeed, inject: [KiteSessionService, InstrumentHistory, FillHistory, DrizzleCandleStore, APP_CONFIG],
      useFactory: (session: KiteSessionService, instruments: InstrumentHistory, fill: FillHistory, store: DrizzleCandleStore, config: AppConfig) => {
        const logger = new Logger('KiteTicker');
        return new KiteTickerFeed({ session, instruments, fill, store, apiKey: config.ZERODHA_API_KEY ?? '',
          log: (reason, error) => {
            const summary = z.object({ name: z.string(), stage: z.enum(['login', 'twofa', 'redirect', 'session']).optional(), message: z.string().optional() }).safeParse(error);
            logger.warn(summary.success ? { reason, ...summary.data } : { reason, code: error instanceof Error ? error.name : 'UNKNOWN' });
          } });
      } },
    { provide: RedisTokenBucket, inject: [REDIS], useFactory: (redis: Redis) => new RedisTokenBucket(redis, 'rl:kite:history', 3, 3) },
    { provide: KiteHistoryProvider, inject: [KiteSessionService, RedisTokenBucket, APP_CONFIG],
      useFactory: (session: KiteSessionService, bucket: RedisTokenBucket, config: AppConfig) =>
        new KiteHistoryProvider(session, bucket, config.ZERODHA_API_KEY ?? '') },
    { provide: MARKET_DATA_PROVIDERS, inject: [KiteHistoryProvider, DerivHistoryProvider, UsDelayedProvider],
      useFactory: (kite: KiteHistoryProvider, deriv: DerivHistoryProvider, us: UsDelayedProvider) =>
        new Map<string, MarketDataProvider>([['kite', kite], ['deriv', deriv], ['us-delayed', us]]) },
    { provide: FillHistory, inject: [DrizzleCandleStore, InstrumentHistory, MARKET_DATA_PROVIDERS],
      useFactory: (store: DrizzleCandleStore, instruments: InstrumentHistory, providers: Map<string, MarketDataProvider>) =>
        new FillHistory(store, instruments, providers) },
    { provide: BackfillHeld, inject: [FillHistory, InstrumentHistory], useFactory: (fill: FillHistory, instruments: InstrumentHistory) => {
      const logger = new Logger('BarsBackfill');
      return new BackfillHeld(fill, instruments, Date.now, { info: value => { logger.log(value); } });
    } },
    { provide: BackfillJob, inject: [JobScheduler, BackfillHeld, KiteTickerFeed, DerivFeed],
      useFactory: (scheduler: JobScheduler, backfill: BackfillHeld, kite: KiteTickerFeed, deriv: DerivFeed) =>
        new BackfillJob(scheduler, backfill, async signal => { await Promise.all([kite.retryBackfills(signal), deriv.retryBackfills(signal)]); }) },
    { provide: DrizzleCandleStore, inject: [DB], useFactory: (db: Database) => new DrizzleCandleStore(db) },
    { provide: RedisFormingBarStore, inject: [REDIS], useFactory: (redis: Redis) => new RedisFormingBarStore(redis) },
    { provide: RedisDepthStore, inject: [REDIS], useFactory: (redis: Redis) => new RedisDepthStore(redis) },
    { provide: RecordDepth, inject: [RedisDepthStore], useFactory: (store: RedisDepthStore) => {
      const logger = new Logger('Depth');
      return new RecordDepth(store, { clock: Date.now, log: (reason, error) => { logger.warn({ reason, code: error instanceof Error ? error.name : 'UNKNOWN' }); } });
    } },
    { provide: StoredBars, inject: [DB], useFactory: (db: Database) => new StoredBars(new DrizzleStoredBarsReader(db)) },
    { provide: ReadDepth, inject: [RedisDepthStore, RedisFeedStateStore, RequestSubscription],
      useFactory: (store: RedisDepthStore, feeds: RedisFeedStateStore, requests: RequestSubscription) => new ReadDepth(store, feeds, requests) },
    { provide: RedisBarPublisher, inject: [REDIS], useFactory: (redis: Redis) => new RedisBarPublisher(redis) },
    { provide: RedisBarSequenceStore, inject: [REDIS], useFactory: (redis: Redis) => new RedisBarSequenceStore(redis) },
    { provide: ReadSeq, inject: [RedisBarSequenceStore], useFactory: (store: RedisBarSequenceStore) => new ReadSeq(store) },
    AggregateLiveBars,
    { provide: BarPublisherToken, useExisting: RedisBarPublisher },
    { provide: LiveBars, inject: [DrizzleCandleStore, RedisFormingBarStore, BarPublisherToken, RedisPreviousCloseStore],
      useFactory: (store: DrizzleCandleStore, forming: RedisFormingBarStore, publisher: BarPublisher, prevCloses: RedisPreviousCloseStore) => {
        const logger = new Logger('LiveBars');
        return new LiveBars(store, forming, { clock: Date.now, log: reason => { logger.warn(reason); }, prevCloses }, publisher);
      } },
    { provide: ReadBars, inject: [DrizzleCandleStore, RedisFormingBarStore, FillHistory, RedisSecondsStore],
      useFactory: (store: DrizzleCandleStore, forming: RedisFormingBarStore, fill: FillHistory, seconds: RedisSecondsStore) => new ReadBars(store, forming, Date.now, fill, seconds) },
    { provide: PartitionJob, inject: [DB, JobScheduler, ReadinessRegistry],
      useFactory: (db: Database, jobs: JobScheduler, ready: ReadinessRegistry) => new PartitionJob(db, jobs, ready) },
    { provide: RetentionJob, inject: [DB, JobScheduler], useFactory: (db: Database, jobs: JobScheduler) => new RetentionJob(db, undefined, jobs) },
  ],
  exports: [StoredBars, ReadDepth, ReadBars, SecondsBars, KiteTickerFeed, DerivFeed, UsDelayedFeed, LiveBars, RequestSubscription, GetQuote, MarketDataService, IpRateLimitGuard, ReadSeq, AggregateLiveBars, GetFeedOverview, CheckSessionCoverage],
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
@Module({ imports: [MarketDataModule, AuthModule], controllers: [MarketDataController, DepthController], exports: [MarketDataModule] })
export class MarketDataApiModule {}
