import { Module } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { InstrumentsApiModule, InstrumentsModule } from '../../src/modules/instruments/instruments.module';
import { MarketDataApiModule, MarketDataModule } from '../../src/modules/market-data/market-data.module';
import { LiveModule } from '../../src/modules/live/live.module';
import { AdminOpsModule } from '../../src/modules/admin-ops/admin-ops.module';
import { AlertsModule } from '../../src/modules/alerts/alerts.module';
import { IndicatorsModule } from '../../src/modules/indicators/indicators.module';
import { PaperTradingModule } from '../../src/modules/paper-trading/paper-trading.module';
import { AgentModule } from '../../src/modules/agent/agent.module';
import { NewsModule } from '../../src/modules/news/news.module';
import { WatchlistsModule } from '../../src/modules/watchlists/watchlists.module';
import { CalendarModule } from '../../src/modules/calendar/calendar.module';
import { StrategiesModule } from '../../src/modules/strategies/strategies.module';
import { FundamentalsModule } from '../../src/modules/fundamentals/fundamentals.module';
import { ScreenerModule } from '../../src/modules/screener/screener.module';
import { UniversesModule } from '../../src/modules/instruments/universes.module';

@Module({})
class NoInstrumentsModule {}

export function isolateInstruments(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder.overrideModule(InstrumentsModule).useModule(NoInstrumentsModule)
    .overrideModule(MarketDataModule).useModule(NoInstrumentsModule)
    .overrideModule(InstrumentsApiModule).useModule(NoInstrumentsModule)
    .overrideModule(MarketDataApiModule).useModule(NoInstrumentsModule)
    .overrideModule(LiveModule).useModule(NoInstrumentsModule)
    .overrideModule(AdminOpsModule).useModule(NoInstrumentsModule)
    .overrideModule(AlertsModule).useModule(NoInstrumentsModule)
    .overrideModule(IndicatorsModule).useModule(NoInstrumentsModule)
    .overrideModule(PaperTradingModule).useModule(NoInstrumentsModule)
    .overrideModule(AgentModule).useModule(NoInstrumentsModule)
    .overrideModule(StrategiesModule).useModule(NoInstrumentsModule)
    .overrideModule(FundamentalsModule).useModule(NoInstrumentsModule)
    .overrideModule(ScreenerModule).useModule(NoInstrumentsModule)
    .overrideModule(UniversesModule).useModule(NoInstrumentsModule)
    .overrideModule(NewsModule).useModule(NoInstrumentsModule)
    .overrideModule(WatchlistsModule).useModule(NoInstrumentsModule)
    .overrideModule(CalendarModule).useModule(NoInstrumentsModule);
}
