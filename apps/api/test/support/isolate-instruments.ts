import { Module } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { InstrumentsApiModule, InstrumentsModule } from '../../src/modules/instruments/instruments.module';
import { MarketDataApiModule, MarketDataModule } from '../../src/modules/market-data/market-data.module';
import { LiveModule } from '../../src/modules/live/live.module';
import { AdminOpsModule } from '../../src/modules/admin-ops/admin-ops.module';
import { AlertsModule } from '../../src/modules/alerts/alerts.module';
import { PaperTradingModule } from '../../src/modules/paper-trading/paper-trading.module';

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
    .overrideModule(PaperTradingModule).useModule(NoInstrumentsModule);
}
