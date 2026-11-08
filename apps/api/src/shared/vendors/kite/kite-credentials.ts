import type { AppConfig } from '../../config';

export interface KiteCredentials {
  apiKey: string;
  apiSecret: string;
  userId: string;
  password: string;
  totpSecret: string;
}
export function kiteCredentials(config: Pick<AppConfig,
  'ZERODHA_API_KEY' | 'ZERODHA_API_SECRET' | 'ZERODHA_USER_ID' | 'ZERODHA_PASSWORD' | 'ZERODHA_TOTP_SECRET'>): KiteCredentials | null {
  const { ZERODHA_API_KEY: apiKey, ZERODHA_API_SECRET: apiSecret, ZERODHA_USER_ID: userId,
    ZERODHA_PASSWORD: password, ZERODHA_TOTP_SECRET: totpSecret } = config;
  return apiKey && apiSecret && userId && password && totpSecret
    ? { apiKey, apiSecret, userId, password, totpSecret } : null;
}
