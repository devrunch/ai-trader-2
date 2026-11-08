import { Module } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { InstrumentsModule } from '../../src/modules/instruments/instruments.module';

@Module({})
class NoInstrumentsModule {}

export function isolateInstruments(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder.overrideModule(InstrumentsModule).useModule(NoInstrumentsModule);
}
