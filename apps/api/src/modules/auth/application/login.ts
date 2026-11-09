import { randomBytes } from 'node:crypto';
import { normalizeUsername } from '../domain/user.js';
import type { UserRepository, UserRecord } from './ports/user.repository.js';
import type { PasswordHasher } from './ports/password-hasher.js';
import type { SessionStore } from './ports/session.store.js';
export class LoginError extends Error { readonly code = 'UNAUTHORIZED'; readonly httpStatus = 401; constructor() { super('Invalid username or password'); } }
export class Login {
  constructor(private readonly users: UserRepository, private readonly passwords: PasswordHasher, private readonly sessions: SessionStore, private readonly now: () => Date = () => new Date()) {}
  async execute(usernameInput: string, password: string, _ip: string, signal?: AbortSignal): Promise<{ user: UserRecord; sessionId: string }> {
    let username: string;
    try { username = normalizeUsername(usernameInput); } catch { username = ''; }
    const user = username ? await this.users.findByUsername(username, signal) : null;
    const valid = user
      ? await this.passwords.verify(user.passwordHash, password, signal).catch(() => false)
      : await this.passwords.verifyDummy(password, signal).then(() => false).catch(() => false);
    const locked = user?.lockedUntil !== null && user?.lockedUntil !== undefined && user.lockedUntil > this.now();
    if (!user || user.disabled || locked || !valid) {
      if (user && !user.disabled && !locked) await this.users.recordFailure(user.id, this.now(), signal);
      throw new LoginError();
    }
    await this.users.resetFailures(user.id, signal);
    const userRecord: UserRecord = { id: user.id, username: user.username, role: user.role };
    return { user: userRecord, sessionId: await this.sessions.create({ userId: user.id, role: user.role, createdAt: this.now().toISOString() }, signal) };
  }
  static sessionId(): string { return randomBytes(32).toString('base64url'); }
}
