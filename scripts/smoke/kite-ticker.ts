// Manager only, during NSE hours. Pipe a JSON configuration object on stdin.
// Example runner: pnpm exec tsx scripts/smoke/kite-ticker.ts < smoke-config.json
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from '../../apps/api/node_modules/zod/index.js';
import { NestFactory } from '../../apps/api/node_modules/@nestjs/core/index.js';
import { sleep } from '../../packages/resilience/src/index.ts';
import { AppModule } from '../../apps/api/src/app.module.ts';
import { loadConfig } from '../../apps/api/src/shared/config/load-config.ts';
import { MarketDataModule } from '../../apps/api/src/modules/market-data/market-data.module.ts';
import { KiteTickerFeed } from '../../apps/api/src/modules/market-data/infrastructure/kite/kite-ticker.feed.ts';
import { DrizzleCandleStore } from '../../apps/api/src/modules/market-data/infrastructure/drizzle-candle-store.ts';
import { ResolveInstrument } from '../../apps/api/src/modules/instruments/application/index.ts';

async function main(): Promise<void> {
  const config = loadConfig(z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(0, 'utf8'))));
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config));
  const feed = app.get(KiteTickerFeed); const store = app.get(DrizzleCandleStore);
  const counts = new Map<string, number>(); const started = Date.now(); const signal = AbortSignal.timeout(360000);
  const states: { state: string; reason?: string }[] = [];
  const offTick = feed.onTick(tick => { counts.set(tick.instrumentId, (counts.get(tick.instrumentId) ?? 0) + 1); });
  const offState = feed.onState((state, reason) => { states.push({ state, ...(reason ? { reason } : {}) }); console.log('feed', state, reason ?? ''); });
  try {
    const gold = await app.get(ResolveInstrument).execute('MCX:GOLD1!');
    const ids = ['NSE:RELIANCE', 'NSE:NIFTY', String(gold.instrument.id)];
    await feed.subscribe(ids); await app.get(MarketDataModule).startFeeds();
    await sleep(90000, signal); console.log('terminating socket at 90 seconds'); feed.disconnectSocket();
    await sleep(90000, signal);
    for (const id of ids) {
      console.log(id, 'ticks', counts.get(id) ?? 0);
      console.log('closed bars', await store.range1m(id, Math.floor(started / 60000) * 60000, Math.floor(Date.now() / 60000) * 60000, signal));
    }
    console.log('reconnect states', states);
    console.log('backfill result: inspect repaired=true above and KiteTicker warning logs for failures');
  } finally { offTick(); offState(); await app.close(); }
}
// Prevent an import from starting a live session.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => { console.error('Kite ticker smoke failed; inspect provider and configuration logs'); process.exitCode = 1; });
}
