// Manager only: pnpm exec tsx scripts/smoke/kite-history.ts (from the repository root).
import { Redis } from '../../apps/api/node_modules/ioredis/built/index.js';
import { kiteCredentials } from '../../apps/api/src/shared/vendors/kite/kite-credentials.ts';
import { createKiteHttp, createKiteTokenExchange, loginToKite } from '../../apps/api/src/shared/vendors/kite/kite-login.ts';
import { KiteSessionService } from '../../apps/api/src/shared/vendors/kite/kite-session.service.ts';
import type { KiteSessionRecord } from '../../apps/api/src/shared/vendors/kite/kite-session.repository.ts';
import { RedisTokenBucket } from '../../apps/api/src/shared/redis/redis-token-bucket.ts';
import { KiteHistoryProvider } from '../../apps/api/src/modules/market-data/infrastructure/kite/kite-history.provider.ts';
import { calendarFor } from '../../apps/api/src/modules/market-data/domain/calendar.ts';
import { addDaysToDate, dateAt } from '../../apps/api/src/modules/market-data/domain/calendars/time.ts';

async function main(): Promise<void> {
  process.loadEnvFile('apps/api/.env');
  const credentials = kiteCredentials(process.env);
  if (!credentials || !process.env.REDIS_URL) throw new Error('Kite credentials and REDIS_URL are required');
  const redis = new Redis(process.env.REDIS_URL, { connectTimeout: 3000, commandTimeout: 1000, maxRetriesPerRequest: 1 });
  redis.on('error', () => { console.error('Redis unavailable'); });
  try {
    let record: KiteSessionRecord | null = null;
    const session = new KiteSessionService(credentials, {
      load: () => Promise.resolve(record), save: value => { record = value; return Promise.resolve(); },
    }, (creds, signal) => loginToKite(creds, createKiteHttp(), signal),
    signal => createKiteTokenExchange(credentials.apiKey, signal));
    const signal = AbortSignal.timeout(180000);
    await session.getAccessToken(signal);
    const provider = new KiteHistoryProvider(session, new RedisTokenBucket(redis, 'rl:kite:history', 3, 3), credentials.apiKey);
    const now = Date.now(); const cal = calendarFor('NSE');
    let date = dateAt(now, cal.timezone);
    let sessions = cal.sessionsOn(date).filter(window => window.close <= now && window.close - window.open > 5 * 3600000);
    while (!sessions.length) { date = addDaysToDate(date, -1); sessions = cal.sessionsOn(date).filter(window => window.close - window.open > 5 * 3600000); }
    const from = sessions[0]?.open; const to = sessions.at(-1)?.close;
    if (from === undefined || to === undefined) throw new Error('No completed session');
    const requests = [
      { id: 'NSE:RELIANCE', mapping: { providerSymbol: 'RELIANCE', providerToken: '2885/738561', volumeType: 'real' }, res: '1m', from, to },
      { id: 'NSE:NIFTY', mapping: { providerSymbol: 'NIFTY 50', providerToken: '1001/256265', volumeType: 'none' }, res: '1d', from: now - 30 * 86400000, to: now },
    ] satisfies { id: string; mapping: Parameters<KiteHistoryProvider['history']>[0]; res: '1m' | '1d'; from: number; to: number }[];
    const ist = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium' });
    for (const request of requests) {
      const result = await provider.history(request.mapping, request.res, request.from, request.to, signal);
      if (!result.ok) throw new Error(`${request.id}: ${result.reason}`);
      console.log(`${request.id} ${request.res}: ${String(result.data.length)} bars; first ${ist.format(result.data[0]?.time)} IST; last ${ist.format(result.data.at(-1)?.time)} IST`);
    }
  } finally { redis.disconnect(); }
}
void main().catch((error: unknown) => {
  const reason = error instanceof Error && /^NSE:[A-Z0-9 ]+: [A-Z_]+$/.test(error.message) ? error.message : 'check configuration and provider availability';
  console.error(`Kite history smoke failed: ${reason}`); process.exitCode = 1;
});
