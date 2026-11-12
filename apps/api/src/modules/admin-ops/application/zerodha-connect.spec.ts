import { describe, expect, it, vi } from 'vitest';
import { ZerodhaStatusSchema } from '@aitrader/contracts';
import type { KiteSessionService } from '../../../shared/vendors/kite/kite-session.service.js';
import { ZerodhaConnect } from './zerodha-connect.js';

const sessions = (extra: object) => ({ adminStatus: vi.fn(() => Promise.resolve({ connected: false, attemptsToday: 2, ...extra })) }) as unknown as KiteSessionService;
describe('ZerodhaConnect.status', () => {
  it('exposes autoLogin.lastFailure as ISO time', async () => {
    const status = await new ZerodhaConnect(sessions({ lastFailure: { stage: 'twofa', message: 'twofa failed: HTTP 403', httpStatus: 403, at: new Date('2026-11-12T03:15:00.000Z') } }), 'key', true).status();
    expect(status.autoLogin.lastFailure).toEqual({ stage: 'twofa', message: 'twofa failed: HTTP 403', httpStatus: 403, at: '2026-11-12T03:15:00.000Z' });
    expect(ZerodhaStatusSchema.safeParse(status).success).toBe(true);
  });
  it('omits lastFailure when there is none', async () => {
    const status = await new ZerodhaConnect(sessions({}), 'key', true).status();
    expect(status.autoLogin).not.toHaveProperty('lastFailure');
  });
});
