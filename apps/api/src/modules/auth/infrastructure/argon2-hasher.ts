import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../application/ports/password-hasher.js';
export class Argon2Hasher implements PasswordHasher {
  private readonly dummyHash: Promise<string>;
  constructor() { this.dummyHash = hash('aitrader-invalid-account-password'); void this.dummyHash.catch(() => undefined); }
  async hash(password: string, signal?: AbortSignal): Promise<string> { signal?.throwIfAborted(); const value = await hash(password); signal?.throwIfAborted(); return value; }
  async verify(encoded: string, password: string, signal?: AbortSignal): Promise<boolean> { signal?.throwIfAborted(); const value = await verify(encoded, password); signal?.throwIfAborted(); return value; }
  async verifyDummy(password: string, signal?: AbortSignal): Promise<void> { signal?.throwIfAborted(); await verify(await this.dummyHash, password); signal?.throwIfAborted(); }
}
