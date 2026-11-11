/// <reference types="node" />
import 'reflect-metadata';
import process from 'node:process';
import { basename } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { Redis } from 'ioredis';
import { configureApp } from './app.setup';
import { MarketDataAppModule } from './market-data-app.module';
import { ConfigError, APP_CONFIG, type AppConfig } from './shared/config';
import { loadRuntimeConfig } from './main';
import { REDIS } from './shared/redis';
import { InstrumentHistory } from './modules/instruments/application';
import { KiteTickerFeed } from './modules/market-data/infrastructure/kite/kite-ticker.feed';
import { DerivFeed } from './modules/market-data/infrastructure/deriv/deriv.feed';
import { UsDelayedFeed } from './modules/market-data/infrastructure/us/us-delayed.feed';
import { LiveBars } from './modules/market-data/application/live-bars';
import { FeedSupervisor } from './modules/market-data/infrastructure/process/feed-supervisor';
import { FeedStatePublisher } from './modules/market-data/infrastructure/process/feed-state.publisher';
import { SubscriptionRequests } from './modules/market-data/infrastructure/process/subscription-requests';
import { LeaderLock } from './modules/market-data/infrastructure/process/leader-lock';
import { ResolveInstrument } from './modules/instruments/application/index';
import { JobScheduler } from './shared/jobs';

export async function startMarketDataProcess(config: AppConfig = loadRuntimeConfig()): Promise<() => Promise<void>> {
  const app = await NestFactory.create(MarketDataAppModule.forRoot(config), { bufferLogs: true });
  configureApp(app, config.TRUST_PROXY); app.useLogger(app.get(Logger)); app.enableShutdownHooks();
  await app.listen(config.MD_PORT);
  const redis = app.get<Redis>(REDIS); const appConfig = app.get<AppConfig>(APP_CONFIG);
  await redis.ping();
  const bars = app.get(LiveBars);
  let isLeader = false;
  const lock = new LeaderLock(redis, appConfig.MD_INSTANCE_ID);
  // Fence on the lock's own lease knowledge: no Redis call on the save path, so a slow Redis never drops bars.
  bars.setPersistenceFence(() => Promise.resolve(lock.holdsLease()));
  const publisher = new FeedStatePublisher(redis, Date.now, (vendor, state, reason) => {
    app.get(Logger).log({ vendor, state, ...(reason === undefined ? {} : { reason }) }, 'Market-data feed state published');
  });
  const requests = new SubscriptionRequests(redis);
  const resolveInstrument = app.get(ResolveInstrument);
  const scheduler = app.get(JobScheduler);
  const supervisor = new FeedSupervisor({ feeds: [app.get(KiteTickerFeed), app.get(DerivFeed), app.get(UsDelayedFeed)], liveBars: bars,
    publisher, requests, held: () => app.get(InstrumentHistory).heldForFeeds(AbortSignal.timeout(5000)),
    resolveContinuous: async id => String((await resolveInstrument.execute(id)).instrument.id),
    scheduleDaily: run => scheduler.register({ name: 'continuous-instrument-roll', cron: '5 0 * * *', tz: 'Asia/Kolkata',
      graceMs: 3600000, maxRuntimeMs: 60000, run: async () => run() }),
    log: message => { app.get(Logger).warn(message); } });
  const controller = new AbortController();
  let shuttingDown: Promise<void> | undefined;
  const shutdown = () => {
    if (shuttingDown) return shuttingDown;
    shuttingDown = (async () => {
      app.get(Logger).log('Market-data shutdown started');
      controller.abort();
      if (isLeader) { await supervisor.stop(); isLeader = false; }
      await lock.release();
      requests.close();
      app.get(Logger).log('Market-data shutdown complete');
      await app.close();
    })();
    return shuttingDown;
  };
  const leaderLoop = lock.acquireLoop(controller.signal, async () => {
    isLeader = true;
    app.get(Logger).log({ instanceId: appConfig.MD_INSTANCE_ID }, 'Market-data leader lock acquired');
    await supervisor.start();
  }, async () => {
    isLeader = false; await supervisor.stop();
    app.get(Logger).warn('Market-data leader lock lost; feeds stopped');
  }).catch(async (error: unknown) => {
    app.get(Logger).error({ code: error instanceof Error ? error.name : 'UNKNOWN', message: error instanceof Error ? error.message : 'Unknown error' }, 'Market-data leader loop failed');
    await shutdown();
  });
  process.once('SIGTERM', () => { void shutdown(); }); process.once('SIGINT', () => { void shutdown(); });
  void leaderLoop;
  return shutdown;
}

if (basename(process.argv[1] ?? '') === 'market-data.main.js') {
  void startMarketDataProcess().catch((error: unknown) => {
    if (error instanceof ConfigError) { process.stderr.write(`${error.message}\n`); process.exit(1); }
    throw error;
  });
}
