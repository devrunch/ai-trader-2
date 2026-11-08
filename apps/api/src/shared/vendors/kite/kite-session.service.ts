import { Logger } from '@nestjs/common';
import { CircuitBreaker, CircuitOpenError, withTimeout } from '@aitrader/resilience';
import { UnavailableError } from '../../errors';
import type { KiteCredentials } from './kite-credentials';
import type { KiteTokenExchange } from './kite-login';
import { KiteLoginError } from './kite-login';
import type { KiteSessionRepository } from './kite-session.repository';

type Login = (credentials: KiteCredentials, signal: AbortSignal) => Promise<{ requestToken: string }>;
type Exchange = KiteTokenExchange | ((signal: AbortSignal) => KiteTokenExchange);
export function nextKiteExpiry(mintedAt: Date): Date {
  const day = 86400000;
  const cutover = 30 * 60000; // 06:00 IST = 00:30 UTC; Kolkata has no daylight-saving transitions.
  return new Date(Math.floor((mintedAt.getTime() - cutover) / day) * day + cutover + day);
}
export class KiteSessionService {
  private readonly logger = new Logger('KiteSession');
  private readonly breaker: CircuitBreaker;
  private inFlight: Promise<string> | undefined;
  constructor(
    private readonly credentials: KiteCredentials | null,
    private readonly repository: KiteSessionRepository,
    private readonly login: Login,
    private readonly exchange: Exchange,
    private readonly now: () => number = Date.now,
  ) { this.breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 15 * 60000, now }); }

  async getAccessToken(signal?: AbortSignal): Promise<string> {
    this.requireCredentials();
    const parent = signal ?? new AbortController().signal;
    const stored = await this.repository.load(parent);
    if (stored && this.now() < stored.expiresAt.getTime() - 60000) return stored.accessToken;
    return this.mint(parent);
  }
  async refresh(signal: AbortSignal): Promise<void> { await this.mint(signal); }
  async status(): Promise<{ valid: boolean; expiresAt?: string; reason?: string }> {
    if (!this.credentials) return { valid: false, reason: 'credentials not configured' };
    const stored = await this.repository.load(AbortSignal.timeout(1500));
    if (stored && this.now() < stored.expiresAt.getTime()) return { valid: true, expiresAt: stored.expiresAt.toISOString() };
    return { valid: false, reason: this.breaker.state === 'open' ? 'PROVIDER_DOWN' : 'no valid token' };
  }
  private requireCredentials(): KiteCredentials {
    if (!this.credentials) throw new UnavailableError('Kite unavailable', { reason: 'kite credentials not configured' });
    return this.credentials;
  }
  private mint(signal: AbortSignal): Promise<string> {
    if (this.inFlight) return this.inFlight;
    const credentials = this.requireCredentials();
    this.inFlight = this.breaker.exec(() => withTimeout(async (signal) => {
      const { requestToken } = await this.login(credentials, signal);
      const exchange = typeof this.exchange === 'function' ? this.exchange(signal) : this.exchange;
      let accessToken: string;
      try { accessToken = (await withTimeout(() => exchange.generateSession(requestToken, credentials.apiSecret), 15000, signal)).access_token; }
      catch { throw new KiteLoginError('session', 'session failed'); }
      const mintedAt = new Date(this.now());
      const expiresAt = nextKiteExpiry(mintedAt);
      await this.repository.save({ accessToken, mintedAt, expiresAt }, signal);
      this.logger.log(`Kite session minted, expires ${expiresAt.toISOString()}`);
      return accessToken;
    }, 115000, signal)).catch((error: unknown) => {
      if (error instanceof CircuitOpenError) throw new UnavailableError('Kite provider unavailable', { vendor: 'kite', retryAfterMs: error.retryAfterMs });
      throw new UnavailableError('Kite session mint failed', { vendor: 'kite', reason: error instanceof KiteLoginError ? `${error.stage} failed` : 'mint failed' });
    }).finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }
}
