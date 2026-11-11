import { randomUUID } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database';
import { JobScheduler } from '../../shared/jobs';
import { AuthModule } from '../auth/auth.module';
import { describeFill, Notifications } from '../notifications/application/index';
import { NotificationsModule } from '../notifications/notifications.module';
import { InstrumentsModule } from '../instruments/instruments.module';
import { ResolveInstrument } from '../instruments/application/index';
import { MarketDataModule } from '../market-data/market-data.module';
import { GetQuote, MarketDataService, RequestSubscription } from '../market-data/application/index';
import { PaperController } from './api/paper.controller';
import { CancelOrder, PlaceOrder, ReadPortfolio } from './application';
import { MatchOpenOrders } from './application/match-open-orders';
import { DEFAULT_PAPER_SETTINGS, type PaperDeps } from './application/paper-settings';
import { PAPER_MARKET, type PaperMarket } from './application/ports/paper-market';
import { PAPER_STORE, type PaperStore } from './application/ports/paper-store';
import { SquareOff } from './application/square-off';
import { DrizzlePaperStore } from './infrastructure/drizzle-paper-store';
import { MarketDataPaperMarket } from './infrastructure/market-data-paper-market';
import { PaperJobsRegistration } from './infrastructure/paper-jobs.registration';

const PAPER_DEPS = Symbol('PAPER_DEPS');
const logger = new Logger('PaperTrading');
const warn = (message: string, detail: Record<string, unknown>) => { logger.warn({ message, ...detail }); };

/** Paper trading (SRD §7.4). PAPER ONLY: no broker order API is imported anywhere in this module. */
@Module({
  imports: [AuthModule, InstrumentsModule, MarketDataModule, NotificationsModule],
  controllers: [PaperController],
  providers: [
    { provide: PAPER_STORE, inject: [DB], useFactory: (db: Database) => new DrizzlePaperStore(db) },
    { provide: PAPER_MARKET, inject: [ResolveInstrument, GetQuote, MarketDataService, RequestSubscription],
      useFactory: (resolve: ResolveInstrument, quote: GetQuote, market: MarketDataService, subscriptions: RequestSubscription) =>
        new MarketDataPaperMarket(resolve, quote, market, subscriptions, warn) },
    { provide: PAPER_DEPS, inject: [Notifications], useFactory: (notifications: Notifications): PaperDeps => ({ clock: Date.now, ids: randomUUID, settings: DEFAULT_PAPER_SETTINGS,
      events: { filled: event => { void notifications.notify({ userId: event.userId, kind: 'fill', ...describeFill(event), link: { symbol: event.instrumentId } }); } } }) },
    { provide: PlaceOrder, inject: [PAPER_STORE, PAPER_MARKET, PAPER_DEPS],
      useFactory: (store: PaperStore, market: PaperMarket, deps: PaperDeps) => new PlaceOrder(store, market, deps) },
    { provide: CancelOrder, inject: [PAPER_STORE, PAPER_DEPS], useFactory: (store: PaperStore, deps: PaperDeps) => new CancelOrder(store, deps) },
    { provide: ReadPortfolio, inject: [PAPER_STORE, PAPER_MARKET, PAPER_DEPS],
      useFactory: (store: PaperStore, market: PaperMarket, deps: PaperDeps) => new ReadPortfolio(store, market, deps) },
    { provide: MatchOpenOrders, inject: [PAPER_STORE, PAPER_MARKET, PAPER_DEPS],
      useFactory: (store: PaperStore, market: PaperMarket, deps: PaperDeps) => new MatchOpenOrders(store, market, deps, warn) },
    { provide: SquareOff, inject: [PAPER_STORE, PAPER_MARKET, PAPER_DEPS, MatchOpenOrders],
      useFactory: (store: PaperStore, market: PaperMarket, deps: PaperDeps, match: MatchOpenOrders) => new SquareOff(store, market, deps, match, warn) },
    { provide: PaperJobsRegistration, inject: [JobScheduler, MatchOpenOrders, SquareOff],
      useFactory: (scheduler: JobScheduler, match: MatchOpenOrders, squareOff: SquareOff) => new PaperJobsRegistration(scheduler, match, squareOff) },
  ],
  exports: [ReadPortfolio, PlaceOrder, CancelOrder],
})
export class PaperTradingModule {}
