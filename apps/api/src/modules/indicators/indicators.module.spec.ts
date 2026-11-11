import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { BarsResponse, IndicatorComputeRequest } from '@aitrader/contracts';
import { DB } from '../../shared/database';
import { AuthModule } from '../auth/auth.module';
import { CsrfHeaderGuard, SessionGuard } from '../auth/api/index';
import { CurrentUser } from '../auth/application/index';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketDataService } from '../market-data/application/index';
import { BUILTINS } from './domain/catalog';
import { IndicatorService } from './application';
import { IndicatorsModule } from './indicators.module';
import { fixtureBars } from './infrastructure/native/bars.spec-helper';

const history = fixtureBars(5001, 7, 60_000);
const market = { bars: (symbol: string, interval: BarsResponse['interval'], _cursor: unknown, limit: number): Promise<BarsResponse> =>
  Promise.resolve({ instrumentId: symbol, resolvedId: 'NSE:TEST', interval, bars: history.slice(0, -1).slice(-limit), nextBefore: null, status: { state: 'ok' } }) };

@Global() @Module({ providers: [{ provide: MarketDataService, useValue: market }], exports: [MarketDataService] })
class FakeMarketDataModule {}
@Global() @Module({ providers: [{ provide: DB, useValue: {} }, { provide: CurrentUser, useValue: {} }, SessionGuard, CsrfHeaderGuard], exports: [DB, CurrentUser, SessionGuard, CsrfHeaderGuard] })
class FakeAuthModule {}

async function service(): Promise<IndicatorService> {
  const module = await Test.createTestingModule({ imports: [IndicatorsModule] }).overrideModule(MarketDataModule).useModule(FakeMarketDataModule)
    .overrideModule(AuthModule).useModule(FakeAuthModule).compile();
  return module.get(IndicatorService);
}
const request = (id: string, limit = 5000): IndicatorComputeRequest => ({ symbol: 'NSE:TEST', interval: '1', indicator: { kind: 'builtin', id, inputs: {} }, range: { limit } });

describe('IndicatorsModule', () => {
  it('computes built-ins natively over market-data bars', async () => {
    const result = await (await service()).compute(request('rsi', 3));
    expect(result.resolvedId).toBe('NSE:TEST');
    expect(result.plots[0]?.values.every(value => typeof value === 'number' && value > 0 && value < 100)).toBe(true);
  });

  // FR-IN-6: ten indicators on the forming bar after 5,000 bars within 5 ms.
  it('updates the ten wave-1 built-ins on a forming-bar tick within 5 ms', async () => {
    const indicators = await service();
    const streams = await Promise.all(BUILTINS.slice(0, 10).map(async b => (await indicators.open(request(b.definition.id))).stream));
    const next = history.at(-1);
    if (!next) throw new Error('no bars');
    const samples: number[] = [];
    for (let tick = 0; tick < 200; tick++) {
      const bar = { ...next, close: next.close + (tick % 7) * 0.1 };
      const started = performance.now();
      await Promise.all(streams.map(stream => stream.push(bar)));
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(5);
    for (const stream of streams) stream.close();
  });
});
