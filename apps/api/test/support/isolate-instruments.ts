import { Module } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { InstrumentsApiModule, InstrumentsModule } from '../../src/modules/instruments/instruments.module';
import { MarketDataApiModule, MarketDataModule } from '../../src/modules/market-data/market-data.module';
import { LiveModule } from '../../src/modules/live/live.module';
import { AdminOpsModule } from '../../src/modules/admin-ops/admin-ops.module';

@Module({})
class NoInstrumentsModule {}

export function isolateInstruments(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder.overrideModule(InstrumentsModule).useModule(NoInstrumentsModule)
    .overrideModule(MarketDataModule).useModule(NoInstrumentsModule)
    .overrideModule(InstrumentsApiModule).useModule(NoInstrumentsModule)
    .overrideModule(MarketDataApiModule).useModule(NoInstrumentsModule)
    .overrideModule(LiveModule).useModule(NoInstrumentsModule)
    .overrideModule(AdminOpsModule).useModule(NoInstrumentsModule);
}
