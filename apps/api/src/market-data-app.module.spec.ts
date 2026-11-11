import 'reflect-metadata';
import { expect, it } from 'vitest';
import type { AppConfig } from './shared/config';
import { MarketDataAppModule } from './market-data-app.module';
import { InstrumentsModule } from './modules/instruments/instruments.module';
import { MarketDataInstrumentsModule } from './modules/instruments/market-data-instruments.module';
import { SEARCH_INDEX } from './modules/instruments/application/ports/search-index';
import { MiniSearchIndex } from './modules/instruments/infrastructure/minisearch-index';

it('market-data process never registers the instrument search index', () => {
  const imports = MarketDataAppModule.forRoot({} as AppConfig).imports ?? [];
  expect(imports).toContain(MarketDataInstrumentsModule);
  expect(imports).not.toContain(InstrumentsModule);
  const providers = (Reflect.getMetadata('providers', MarketDataInstrumentsModule) as unknown[]).map(p => (p as { provide?: unknown }).provide);
  expect(providers).not.toContain(SEARCH_INDEX);
  expect(providers).not.toContain(MiniSearchIndex);
  expect(Reflect.getMetadata('design:paramtypes', MarketDataInstrumentsModule) ?? []).toEqual([]);
});
