// Manager only: run from the repository root. This script never loads credentials.
import { sleep } from '../../packages/resilience/src/index.ts';
import { DerivHistoryProvider } from '../../apps/api/src/modules/market-data/infrastructure/deriv/deriv-history.provider.ts';
import { DerivFeed } from '../../apps/api/src/modules/market-data/infrastructure/deriv/deriv.feed.ts';
import { UsDelayedProvider } from '../../apps/api/src/modules/market-data/infrastructure/us/us-delayed.provider.ts';
import type { CandleStore } from '../../apps/api/src/modules/market-data/application/ports/candle-store.ts';
import { calendarFor } from '../../apps/api/src/modules/market-data/domain/calendar.ts';
import { addDaysToDate, dateAt } from '../../apps/api/src/modules/market-data/domain/calendars/time.ts';

function recentFxHour(now: number): { from: number; to: number } {
  const calendar = calendarFor('FX'); const today = dateAt(now, calendar.timezone);
  for (let days = 0; days < 8; days++) {
    const session = calendar.sessionsOn(addDaysToDate(today, -days)).filter(window => window.close <= now && window.close - window.open >= 3600000).at(-1);
    if (session) return { from: session.close - 3600000, to: session.close };
  }
  throw new Error('MARKET_CLOSED');
}
function reasonCode(error: unknown): string {
  return error instanceof Error && /^(NO_DATA|MARKET_CLOSED|UNSUPPORTED|RATE_LIMITED|PROVIDER_DOWN|AUTH_EXPIRED)$/.test(error.message) ? error.message : 'PROVIDER_DOWN';
}

async function main(): Promise<void> {
  const signal = AbortSignal.timeout(120000); const now = Date.now();
  const deriv = new DerivHistoryProvider(); const window = recentFxHour(now);
  const gold = await deriv.history({ providerSymbol: 'frxXAUUSD' }, '1m', window.from, window.to, signal);
  const us = await new UsDelayedProvider().history({ providerSymbol: 'AAPL' }, '1d', now - 10 * 86400000, now, signal);
  console.log('OANDA:XAUUSD 1m', gold.ok ? gold.data.length : gold.reason);
  console.log('NASDAQ:AAPL 1d', us.ok ? us.data.length : us.reason);
  if (!gold.ok || !us.ok) process.exitCode = 1;
  const store: CandleStore = {
    range1m: () => Promise.resolve([]), range1d: () => Promise.resolve([]), earliest: () => Promise.resolve(null),
    upsert1m: () => Promise.resolve({ written: 0, repaired: 0 }), upsert1d: () => Promise.resolve({ written: 0, repaired: 0 }),
  };
  const feed = new DerivFeed({ instruments: {
    getMapping: id => Promise.resolve(id === 'OANDA:XAUUSD' ? { providerSymbol: 'frxXAUUSD', volumeType: 'none' } : undefined),
    held: () => Promise.resolve([]),
  }, fill: { execute: async (id, res, from, to, abort) => {
    if (id !== 'OANDA:XAUUSD') return { ok: false, reason: 'UNSUPPORTED' };
    const result = await deriv.history({ providerSymbol: 'frxXAUUSD' }, res, from, to, abort);
    return result.ok ? { ok: true, data: { written: result.data.length, repaired: 0 } } : result;
  } }, store, log: (_reason, error) => { console.log('OANDA:XAUUSD ticks', reasonCode(error)); process.exitCode = 1; } });
  let ticks = 0; feed.onTick(() => { ticks++; });
  try {
    await feed.subscribe(['OANDA:XAUUSD']);
    await Promise.race([feed.start(), sleep(15000, signal).then(() => { throw new Error('PROVIDER_DOWN'); })]);
    await sleep(60000, signal);
    console.log('OANDA:XAUUSD ticks', ticks || (calendarFor('FX').isOpen(Date.now()) ? 'NO_DATA' : 'MARKET_CLOSED'));
  } finally { await feed.stop(); }
}
void main().catch((error: unknown) => { console.error(reasonCode(error)); process.exitCode = 1; });
