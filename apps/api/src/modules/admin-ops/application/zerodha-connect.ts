import { BadRequestValidationError } from '../../../shared/errors/index.js';
import { KiteSessionService } from '../../../shared/vendors/kite/kite-session.service.js';

export interface ZerodhaStatus {
  connected: boolean;
  expiresAt?: string;
  autoLogin: { enabled: boolean; blockedUntil?: string; reason?: string; attemptsToday: number; cap: 6 };
  loginUrl: string;
  redirectUrl: string | null;
}

export class ZerodhaConnect {
  constructor(private readonly sessions: KiteSessionService, private readonly apiKey: string | undefined,
    private readonly autoLoginEnabled: boolean, private readonly redirectUrl?: string) {}
  async status(): Promise<ZerodhaStatus> {
    const status = await this.sessions.adminStatus();
    return { connected: status.connected, ...(status.expiresAt ? { expiresAt: status.expiresAt } : {}),
      autoLogin: { enabled: this.autoLoginEnabled, ...(status.blockedUntil ? { blockedUntil: status.blockedUntil } : {}),
        ...(status.reason ? { reason: status.reason } : {}), attemptsToday: status.attemptsToday, cap: 6 },
      loginUrl: `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(this.apiKey ?? '')}`,
      redirectUrl: this.redirectUrl ?? null };
  }
  connect(requestToken: string): Promise<{ connected: true; expiresAt: string }> {
    if (!/^[A-Za-z0-9]{8,64}$/.test(requestToken)) throw new BadRequestValidationError('Invalid request token', { reason: 'INVALID_REQUEST_TOKEN' });
    return this.sessions.connect(requestToken).then(({ expiresAt }) => ({ connected: true, expiresAt }));
  }
  async autoLogin(): Promise<{ connected: true; expiresAt: string }> {
    const result = await this.sessions.autoLoginNow();
    return { connected: true, expiresAt: result.expiresAt };
  }
  async disconnect(): Promise<{ connected: false }> { await this.sessions.disconnect(); return { connected: false }; }
}
