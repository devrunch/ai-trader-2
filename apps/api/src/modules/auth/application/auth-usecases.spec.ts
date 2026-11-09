import { describe, expect, it, vi } from 'vitest';
import { CreateAdmin } from './create-admin.js';
import { CurrentUser } from './current-user.js';
import { Logout } from './logout.js';
import type { User } from '../domain/user.js';

const user: User = { id: '00000000-0000-4000-8000-000000000001', username: 'admin', role: 'admin', passwordHash: 'hash', disabled: false, failedLogins: 0, lockedUntil: null };
function users(overrides: Partial<{ findById: (id: string) => Promise<User | null>; upsertAdmin: (username: string, hash: string) => Promise<void> }> = {}) {
  return { findByUsername: () => Promise.resolve(null), findById: overrides.findById ?? (() => Promise.resolve(user)), recordFailure: () => Promise.resolve(), resetFailures: () => Promise.resolve(), upsertAdmin: overrides.upsertAdmin ?? (() => Promise.resolve()) };
}
function sessions(get: (id: string) => Promise<{ userId: string; role: 'admin' | 'user'; createdAt: string } | null> = () => Promise.resolve(null), remove: (id: string) => Promise<void> = () => Promise.resolve()) {
  return { create: () => Promise.resolve('new-session'), get, delete: remove };
}
describe('auth use cases FR-AC-1 NFR-SC-1', () => {
  it('returns the current enabled user from a valid session', async () => {
    const current = new CurrentUser(users(), sessions(() => Promise.resolve({ userId: user.id, role: user.role, createdAt: new Date().toISOString() })));
    await expect(current.execute('session')).resolves.toEqual({ id: user.id, username: 'admin', role: 'admin' });
  });
  it('returns no current user for a disabled account or missing session', async () => {
    const repository = users({ findById: () => Promise.resolve({ ...user, disabled: true }) });
    const store = sessions(id => Promise.resolve(id === 'active' ? { userId: user.id, role: user.role, createdAt: new Date().toISOString() } : null));
    const current = new CurrentUser(repository, store);
    await expect(current.execute('active')).resolves.toBeNull(); await expect(current.execute(undefined)).resolves.toBeNull();
  });
  it('deletes a session on logout and accepts a missing session', async () => {
    const remove = vi.fn(() => Promise.resolve()); const logout = new Logout(sessions(undefined, remove));
    await logout.execute('session'); await logout.execute(undefined); expect(remove).toHaveBeenCalledTimes(1);
  });
  it('validates and hashes admin credentials before upsert', async () => {
    const upsertAdmin = vi.fn<(username: string, passwordHash: string) => Promise<void>>(() => Promise.resolve()); const hash = vi.fn<(password: string) => Promise<string>>(() => Promise.resolve('encoded'));
    const createAdmin = new CreateAdmin(users({ upsertAdmin }), { hash, verify: () => Promise.resolve(false), verifyDummy: () => Promise.resolve() });
    await createAdmin.execute('Owner_Admin', 'a-long-password');
    expect(hash).toHaveBeenCalledWith('a-long-password', undefined); expect(upsertAdmin).toHaveBeenCalledWith('owner_admin', 'encoded', undefined);
    await expect(createAdmin.execute('owner_admin', 'short')).rejects.toThrow();
  });
});
