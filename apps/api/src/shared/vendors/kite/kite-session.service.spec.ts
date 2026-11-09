import { describe, expect, it, vi } from 'vitest';
import { KiteSessionService, nextKiteExpiry } from './kite-session.service';
import type { KiteSessionRecord, KiteSessionRepository } from './kite-session.repository';
import { UnavailableError } from '../../errors';
import { KiteLoginError } from './kite-login';

const credentials = { apiKey: 'key', apiSecret: 'secret', userId: 'user', password: 'password', totpSecret: 'totp' };
function setup(record: KiteSessionRecord | null = null, configured = true, sharedRepository?: KiteSessionRepository, autoLoginEnabled = true) {
  const save = vi.fn<KiteSessionRepository['save']>((value) => { record = value; return Promise.resolve(); });
  const repository: KiteSessionRepository = sharedRepository ?? { load: vi.fn(() => Promise.resolve(record)), save,
    autoLoginBlock: vi.fn(() => Promise.resolve({ blockedUntil: null, reason: null, attemptsToday: 0 })),
    blockAutoLogin: vi.fn(() => Promise.resolve()), clearAutoLoginBlock: vi.fn(() => Promise.resolve()), disconnect: vi.fn(() => Promise.resolve()),
    reserveLoginAttempt: vi.fn(() => Promise.resolve({ allowed: true, retryAt: new Date('2026-11-09T18:30:00.000Z') })) };
  const login = vi.fn(() => Promise.resolve({ requestToken: 'request' }));
  const exchange = { generateSession: vi.fn(() => Promise.resolve({ access_token: 'minted', user_id: 'user' })), invalidateAccessToken: vi.fn(() => Promise.resolve(true)) };
  let time = Date.parse('2026-11-08T01:00:00Z');
  const logger = { log: vi.fn() };
  const service = new KiteSessionService(configured ? credentials : null, repository, login, exchange, () => time, logger, autoLoginEnabled);
  return { service, save, login, exchange, logger, repository, advance: (ms: number) => { time += ms; } };
}
const stored = (expiresAt: string): KiteSessionRecord => ({ accessToken: 'stored', mintedAt: new Date('2026-11-07T01:00:00Z'), expiresAt: new Date(expiresAt) });
// FR-MD-3, E3, NFR-RB-2, NFR-SC-1.
describe('Kite session', () => {
  it('reuses a stored unexpired token', async () => {
    const { service, login } = setup(stored('2026-11-09T00:30:00Z'));
    await expect(service.getAccessToken()).resolves.toBe('stored');
    expect(login).not.toHaveBeenCalled();
  });
  it('mints when the stored token is within 60 s of expiry', async () => {
    const { service, save, logger } = setup(stored('2026-11-08T01:00:59Z'));
    await expect(service.getAccessToken()).resolves.toBe('minted');
    expect(save).toHaveBeenCalledWith({ accessToken: 'minted', mintedAt: new Date('2026-11-08T01:00:00Z'), expiresAt: new Date('2026-11-09T00:30:00Z') }, expect.any(AbortSignal));
    expect(logger.log).toHaveBeenCalledWith('Kite session minted, expires 2026-11-09T00:30:00.000Z');
  });
  it('mints once for concurrent callers', async () => {
    const { service, login, exchange } = setup();
    expect(await Promise.all(Array.from({ length: 10 }, () => service.getAccessToken()))).toEqual(Array(10).fill('minted'));
    expect(login).toHaveBeenCalledTimes(1);
    expect(exchange.generateSession).toHaveBeenCalledTimes(1);
  });
  it('exhausted logins make no network call', async () => {
    const { service, login } = setup();
    vi.spyOn(service['repository'], 'reserveLoginAttempt').mockResolvedValue({ allowed: false, retryAt: new Date('2026-11-09T18:30:00.000Z') });
    await expect(service.getAccessToken()).rejects.toMatchObject({ details: { reason: 'login attempts exhausted', retryAt: '2026-11-09T18:30:00.000Z' } });
    expect(login).not.toHaveBeenCalled();
  });
  it('blocked auto-login makes no network call and reports CAPTCHA_REQUIRED', async () => {
    const { service, login, repository } = setup();
    vi.spyOn(repository, 'autoLoginBlock').mockResolvedValue({ blockedUntil: new Date('2026-11-09T01:00:00.000Z'), reason: 'CAPTCHA_REQUIRED', attemptsToday: 1 });
    await expect(service.getAccessToken()).rejects.toMatchObject({ details: { reason: 'CAPTCHA_REQUIRED', action: 'connect_zerodha' } });
    expect(login).not.toHaveBeenCalled();
  });
  it('auto-login disabled reports NOT_CONNECTED without a network call', async () => {
    const { service, login } = setup(null, true, undefined, false);
    await expect(service.getAccessToken()).rejects.toMatchObject({ details: { reason: 'NOT_CONNECTED', action: 'connect_zerodha' } });
    expect(login).not.toHaveBeenCalled();
  });
  it('CAPTCHA failure blocks auto-login for 24 hours', async () => {
    const { service, login, repository } = setup();
    const block = vi.spyOn(repository, 'blockAutoLogin');
    login.mockRejectedValue(new KiteLoginError('login', 'captcha required', true));
    await expect(service.getAccessToken()).rejects.toBeInstanceOf(UnavailableError);
    expect(block).toHaveBeenCalledWith(new Date('2026-11-09T01:00:00.000Z'), 'CAPTCHA_REQUIRED', expect.any(AbortSignal));
  });
  it('the matching account is stored', async () => {
    const { service, save, exchange, repository } = setup();
    const clearBlock = vi.spyOn(repository, 'clearAutoLoginBlock');
    await expect(service.connect('Valid1234')).resolves.toEqual({ expiresAt: '2026-11-09T00:30:00.000Z' });
    expect(exchange.generateSession).toHaveBeenCalledWith('Valid1234', credentials.apiSecret);
    expect(save).toHaveBeenCalledWith({ accessToken: 'minted', mintedAt: new Date('2026-11-08T01:00:00.000Z'), expiresAt: new Date('2026-11-09T00:30:00.000Z') }, expect.any(AbortSignal));
    expect(clearBlock).toHaveBeenCalledOnce();
  });
  it('a token from another Zerodha account is rejected and not stored', async () => {
    const { service, save, exchange } = setup();
    exchange.generateSession.mockResolvedValue({ access_token: 'foreign-token', user_id: 'other-account' });
    exchange.invalidateAccessToken.mockRejectedValue(new Error('invalid token cleanup failed'));
    await expect(service.connect('Valid1234')).rejects.toMatchObject({ code: 'VALIDATION_FAILED', httpStatus: 400, details: { reason: 'ACCOUNT_MISMATCH' } });
    expect(save).not.toHaveBeenCalled();
    expect(exchange.invalidateAccessToken).toHaveBeenCalledWith('foreign-token');
  });
  it('expiry is the next 06:00 IST', () => {
    expect(nextKiteExpiry(new Date('2026-11-08T05:59:00+05:30')).toISOString()).toBe('2026-11-08T00:30:00.000Z');
    expect(nextKiteExpiry(new Date('2026-11-08T06:20:00+05:30')).toISOString()).toBe('2026-11-09T00:30:00.000Z');
    expect(nextKiteExpiry(new Date('2026-11-08T06:00:00+05:30')).toISOString()).toBe('2026-11-09T00:30:00.000Z');
  });
  it('opens the breaker after 3 failed mints and fails fast with retryAfterMs', async () => {
    const { service, login, advance } = setup();
    login.mockRejectedValue(new Error('vendor secret'));
    for (let i = 0; i < 3; i++) await expect(service.getAccessToken()).rejects.toBeInstanceOf(UnavailableError);
    await expect(service.getAccessToken()).rejects.toMatchObject({ details: { vendor: 'kite', retryAfterMs: 900000 } });
    expect(login).toHaveBeenCalledTimes(3);
    advance(900000);
    login.mockResolvedValue({ requestToken: 'recovered' });
    await expect(service.getAccessToken()).resolves.toBe('minted');
  });
  it('readiness reports down without minting when no token exists', async () => {
    const { service, login } = setup();
    await expect(service.status()).resolves.toEqual({ valid: false, reason: 'no valid token' });
    expect(login).not.toHaveBeenCalled();
  });
  it('throws credentials not configured when config lacks them', async () => {
    const { service, login } = setup(null, false);
    await expect(service.getAccessToken()).rejects.toMatchObject({ details: { reason: 'kite credentials not configured' } });
    await expect(service.status()).resolves.toEqual({ valid: false, reason: 'credentials not configured' });
    expect(login).not.toHaveBeenCalled();
  });
});
