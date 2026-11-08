import { describe, expect, it, vi } from 'vitest';
import { KiteSessionService, nextKiteExpiry } from './kite-session.service';
import type { KiteSessionRecord, KiteSessionRepository } from './kite-session.repository';
import { UnavailableError } from '../../errors';

const credentials = { apiKey: 'key', apiSecret: 'secret', userId: 'user', password: 'password', totpSecret: 'totp' };
function setup(record: KiteSessionRecord | null = null, configured = true) {
  const save = vi.fn<KiteSessionRepository['save']>((value) => { record = value; return Promise.resolve(); });
  const repository: KiteSessionRepository = { load: vi.fn(() => Promise.resolve(record)), save };
  const login = vi.fn(() => Promise.resolve({ requestToken: 'request' }));
  const exchange = { generateSession: vi.fn(() => Promise.resolve({ access_token: 'minted' })) };
  let time = Date.parse('2026-11-08T01:00:00Z');
  const service = new KiteSessionService(configured ? credentials : null, repository, login, exchange, () => time);
  return { service, save, login, exchange, advance: (ms: number) => { time += ms; } };
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
    const { service, save } = setup(stored('2026-11-08T01:00:59Z'));
    await expect(service.getAccessToken()).resolves.toBe('minted');
    expect(save).toHaveBeenCalledWith({ accessToken: 'minted', mintedAt: new Date('2026-11-08T01:00:00Z'), expiresAt: new Date('2026-11-09T00:30:00Z') }, expect.any(AbortSignal));
  });
  it('mints once for concurrent callers', async () => {
    const { service, login, exchange } = setup();
    expect(await Promise.all(Array.from({ length: 10 }, () => service.getAccessToken()))).toEqual(Array(10).fill('minted'));
    expect(login).toHaveBeenCalledTimes(1);
    expect(exchange.generateSession).toHaveBeenCalledTimes(1);
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
