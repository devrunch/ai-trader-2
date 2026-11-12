import { Logger } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { CircuitBreaker, CircuitOpenError, withTimeout } from '@aitrader/resilience';
import { BadRequestValidationError, UnavailableError } from '../../errors';
import type { KiteCredentials } from './kite-credentials';
import type { KiteTokenExchange } from './kite-login';
import { KiteLoginError } from './kite-login';
import { sanitizeFailureMessage, type KiteLoginFailure } from './kite-failure';
import type { KiteSessionRepository } from './kite-session.repository';

type Login = (credentials: KiteCredentials, signal: AbortSignal) => Promise<{ requestToken: string }>;
type Exchange = KiteTokenExchange | ((signal: AbortSignal) => KiteTokenExchange);
export function nextKiteExpiry(mintedAt: Date): Date {
  const day = 86400000;
  const cutover = 30 * 60000; // 06:00 IST = 00:30 UTC; Kolkata has no daylight-saving transitions.
  return new Date(Math.floor((mintedAt.getTime() - cutover) / day) * day + cutover + day);
}
export class KiteSessionService {
  private readonly breaker: CircuitBreaker;
  private inFlight: Promise<string> | undefined;
  constructor(
    private readonly credentials: KiteCredentials | null,
    private readonly repository: KiteSessionRepository,
    private readonly login: Login,
    private readonly exchange: Exchange,
    private readonly now: () => number = Date.now,
    private readonly logger: Pick<LoggerService, 'log' | 'warn'> = new Logger('KiteSession'),
    private autoLoginEnabled = false,
  ) { this.breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 15 * 60000, now }); }

  async getAccessToken(signal?: AbortSignal): Promise<string> {
    this.requireCredentials();
    const parent = signal ?? new AbortController().signal;
    const stored = await this.repository.load(parent);
    if (stored && this.now() < stored.expiresAt.getTime() - 60000) return stored.accessToken;
    const block = await this.repository.autoLoginBlock(parent);
    if (block.blockedUntil && block.blockedUntil.getTime() > this.now()) throw this.unavailableFor(block.reason ?? 'CAPTCHA_REQUIRED');
    if (!this.autoLoginEnabled) throw this.unavailableFor('NOT_CONNECTED');
    return this.mint(parent);
  }
  async refresh(signal: AbortSignal): Promise<void> { if (this.autoLoginEnabled) await this.mint(signal); }
  async connect(requestToken: string, signal = AbortSignal.timeout(15000)): Promise<{ expiresAt: string }> {
    let accessToken: string;
    try { accessToken = await this.exchangeForAccount(requestToken, signal); }
    catch (error) {
      if (error instanceof BadRequestValidationError) throw error;
      throw new UnavailableError('Kite session exchange failed', { reason: 'EXCHANGE_FAILED' });
    }
    const mintedAt = new Date(this.now()); const expiresAt = nextKiteExpiry(mintedAt);
    await this.repository.save({ accessToken, mintedAt, expiresAt }, signal);
    await this.repository.clearAutoLoginBlock(signal);
    return { expiresAt: expiresAt.toISOString() };
  }
  private async exchangeForAccount(requestToken: string, signal: AbortSignal): Promise<string> {
    const credentials = this.requireCredentials();
    const exchange = typeof this.exchange === 'function' ? this.exchange(signal) : this.exchange;
    let session: Awaited<ReturnType<KiteTokenExchange['generateSession']>>;
    try { session = await withTimeout(() => exchange.generateSession(requestToken, credentials.apiSecret), 15000, signal); }
    catch (error) {
      if (error instanceof KiteLoginError) throw error;
      throw new KiteLoginError('session', `session failed: ${errorDetail(error)}`, false, errorStatus(error));
    }
    if (session.user_id.toUpperCase() !== credentials.userId.toUpperCase()) {
      try {
        await withTimeout(() => exchange.invalidateAccessToken?.(session.access_token) ?? Promise.resolve(false), 15000, signal);
      } catch { /* Invalidation is best effort; never store a token for another account. */ }
      throw new BadRequestValidationError('Zerodha account mismatch', { reason: 'ACCOUNT_MISMATCH' });
    }
    return session.access_token;
  }
  async disconnect(signal = AbortSignal.timeout(1500)): Promise<void> { await this.repository.disconnect(signal); }
  async adminStatus(): Promise<{ connected: boolean; expiresAt?: string; blockedUntil?: string; reason?: string; attemptsToday: number; lastFailure?: KiteLoginFailure }> {
    const [session, block, failure] = await Promise.all([this.status(), this.repository.autoLoginBlock(AbortSignal.timeout(1500)),
      this.repository.lastLoginFailure(AbortSignal.timeout(1500))]);
    const activeBlock = block.blockedUntil && block.blockedUntil.getTime() > this.now();
    const blockedUntil = activeBlock ? block.blockedUntil?.toISOString() : undefined;
    return { connected: session.valid, ...(session.expiresAt ? { expiresAt: session.expiresAt } : {}),
      ...(blockedUntil && block.reason ? { blockedUntil, reason: block.reason } : {}), attemptsToday: block.attemptsToday,
      ...(failure ? { lastFailure: failure } : {}) };
  }
  async autoLoginNow(signal = AbortSignal.timeout(115000)): Promise<{ expiresAt: string }> { return this.mint(signal).then(async () => {
    const current = await this.status(); return { expiresAt: current.expiresAt ?? '' };
  }); }
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
    this.inFlight = this.repository.autoLoginBlock(signal).then(block => {
      if (block.blockedUntil && block.blockedUntil.getTime() > this.now()) throw this.unavailableFor(block.reason ?? 'CAPTCHA_REQUIRED');
      if (!this.autoLoginEnabled) throw this.unavailableFor('NOT_CONNECTED');
      return this.repository.reserveLoginAttempt(new Date(this.now()), signal);
    }).then(reservation => {
      if (!reservation.allowed) throw new UnavailableError('Kite login attempts exhausted', {
        reason: 'login attempts exhausted', retryAt: reservation.retryAt.toISOString(),
      });
      return this.breaker.exec(() => withTimeout(async (signal) => {
      let requestToken: string;
      try { ({ requestToken } = await this.login(credentials, signal)); }
      catch (error) {
        if (error instanceof KiteLoginError && error.captcha) await this.repository.blockAutoLogin(new Date(this.now() + 86400000), 'CAPTCHA_REQUIRED', signal);
        throw error;
      }
      const accessToken = await this.exchangeForAccount(requestToken, signal);
      const mintedAt = new Date(this.now());
      const expiresAt = nextKiteExpiry(mintedAt);
      await this.repository.save({ accessToken, mintedAt, expiresAt }, signal);
      this.logger.log(`Kite session minted, expires ${expiresAt.toISOString()}`);
      return accessToken;
      }, 115000, signal));
    }).catch(async (error: unknown) => {
      if (!(error instanceof CircuitOpenError) && !isGateRefusal(error)) await this.recordFailure(error, credentials);
      if (error instanceof CircuitOpenError) throw new UnavailableError('Kite provider unavailable', { vendor: 'kite', retryAfterMs: error.retryAfterMs });
      if (error instanceof BadRequestValidationError) throw error;
      if (error instanceof UnavailableError && ['CAPTCHA_REQUIRED', 'NOT_CONNECTED'].includes(String(error.details?.reason))) throw error;
      if (error instanceof UnavailableError && error.details?.reason === 'login attempts exhausted') throw error;
      throw new UnavailableError('Kite session mint failed', { vendor: 'kite', reason: error instanceof KiteLoginError ? `${error.stage} failed` : 'mint failed' });
    }).finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }
  private async recordFailure(error: unknown, credentials: KiteCredentials): Promise<void> {
    const secrets = [credentials.password, credentials.totpSecret, credentials.apiSecret, credentials.apiKey];
    const failure: KiteLoginFailure = error instanceof KiteLoginError
      ? { stage: error.stage, message: sanitizeFailureMessage(error.message, secrets), at: new Date(this.now()),
        ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }) }
      : { stage: error instanceof BadRequestValidationError ? 'session' : 'unknown', at: new Date(this.now()),
        message: sanitizeFailureMessage(error instanceof BadRequestValidationError ? error.message : `mint failed: ${errorDetail(error)}`, secrets) };
    this.logger.warn(`Kite auto-login failed at ${failure.stage}${failure.httpStatus === undefined ? '' : ` (HTTP ${String(failure.httpStatus)})`}: ${failure.message}`);
    try { await this.repository.recordLoginFailure(failure, AbortSignal.timeout(1500)); }
    catch { this.logger.warn('Kite auto-login failure could not be stored'); }
  }
  private unavailableFor(reason: string): UnavailableError { return new UnavailableError('Connect Zerodha to continue', { reason, action: 'connect_zerodha' }); }
}
function isGateRefusal(error: unknown): boolean {
  return error instanceof UnavailableError && ['CAPTCHA_REQUIRED', 'NOT_CONNECTED', 'login attempts exhausted'].includes(String(error.details?.reason));
}
function errorDetail(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}
function errorStatus(error: unknown): number | undefined {
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
  return typeof status === 'number' ? status : undefined;
}
