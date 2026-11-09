import { describe, expect, it } from 'vitest';
import { Login } from './login.js';
import type { User } from '../domain/user.js';
const known: User = { id: 'id', username: 'known', role: 'user', passwordHash: 'hash', disabled: false, failedLogins: 0, lockedUntil: null };
const sessions = { create: () => Promise.resolve('sid'), get: () => Promise.resolve(null), delete: () => Promise.resolve() };
describe('Login FR-AC-1 NFR-SC-1 NFR-SC-5', () => {
  it('login returns the same error for unknown user and wrong password', async () => {
    const users = { findByUsername: (username: string) => Promise.resolve(username === 'known' ? known : null), findById: () => Promise.resolve(null), recordFailure: () => Promise.resolve(), resetFailures: () => Promise.resolve(), upsertAdmin: () => Promise.resolve() };
    const login = new Login(users, { verify: () => Promise.resolve(false), hash: () => Promise.resolve('dummy'), verifyDummy: () => Promise.resolve() }, sessions, () => new Date());
    const outcomes = await Promise.all(['unknown', 'known'].map(async username => { try { await login.execute(username, 'bad-password', '127.0.0.1'); return 'ok'; } catch (error) { return error instanceof Error ? error.message : ''; } }));
    expect(outcomes[0]).toBe(outcomes[1]);
  });
  it('locks the account after 5 failures for 15 minutes', async () => {
    let failures = 0; let lockedUntil: Date | null = null;
    const users = { findByUsername: () => Promise.resolve({ ...known, failedLogins: failures, lockedUntil }), findById: () => Promise.resolve(null), recordFailure: (_id: string, now: Date) => { failures += 1; if (failures === 5) lockedUntil = new Date(now.getTime() + 15 * 60_000); return Promise.resolve(); }, resetFailures: () => Promise.resolve(), upsertAdmin: () => Promise.resolve() };
    const now = new Date('2026-01-01T00:00:00Z'); const login = new Login(users, { verify: () => Promise.resolve(false), hash: () => Promise.resolve('dummy'), verifyDummy: () => Promise.resolve() }, sessions, () => now);
    for (let attempt = 0; attempt < 5; attempt += 1) { try { await login.execute('known', 'bad-password', 'ip'); } catch { /* Expected rejected credentials. */ } }
    expect(lockedUntil).toEqual(new Date('2026-01-01T00:15:00.000Z'));
  });
  it('successful login resets failures', async () => {
    let resets = 0;
    const users = { findByUsername: () => Promise.resolve({ ...known, failedLogins: 1 }), findById: () => Promise.resolve(null), recordFailure: () => Promise.resolve(), resetFailures: () => { resets += 1; return Promise.resolve(); }, upsertAdmin: () => Promise.resolve() };
    const login = new Login(users, { verify: () => Promise.resolve(true), hash: () => Promise.resolve('dummy'), verifyDummy: () => Promise.resolve() }, sessions, () => new Date());
    await login.execute('known', 'good-password', 'ip'); expect(resets).toBe(1);
  });
});
