// Manager-run from the repository root: pnpm exec tsx scripts/smoke/kite-login.ts
import { kiteCredentials } from '../../apps/api/src/shared/vendors/kite/kite-credentials.ts';
import { createKiteHttp, createKiteTokenExchange, KiteLoginError, loginToKite } from '../../apps/api/src/shared/vendors/kite/kite-login.ts';
import { nextKiteExpiry } from '../../apps/api/src/shared/vendors/kite/kite-session.service.ts';

async function main(): Promise<void> {
  try {
    process.loadEnvFile('apps/api/.env');
    const credentials = kiteCredentials({
      ZERODHA_API_KEY: process.env.ZERODHA_API_KEY,
      ZERODHA_API_SECRET: process.env.ZERODHA_API_SECRET,
      ZERODHA_USER_ID: process.env.ZERODHA_USER_ID,
      ZERODHA_PASSWORD: process.env.ZERODHA_PASSWORD,
      ZERODHA_TOTP_SECRET: process.env.ZERODHA_TOTP_SECRET,
    });
    if (!credentials) throw new KiteLoginError('login', 'credentials not configured');
    const signal = AbortSignal.timeout(120000);
    const { requestToken } = await loginToKite(credentials, createKiteHttp(), signal);
    await createKiteTokenExchange(credentials.apiKey, signal).generateSession(requestToken, credentials.apiSecret);
    console.log(`kite login ok — expires ${nextKiteExpiry(new Date()).toISOString()}`);
    process.exitCode = 0;
  } catch (error) {
    const stage = error instanceof KiteLoginError ? error.stage : 'login';
    const message = error instanceof KiteLoginError ? error.message : 'configuration or login failed';
    console.log(`kite login failed at ${stage}: ${message}`);
    process.exitCode = 1;
  }
}
void main();
