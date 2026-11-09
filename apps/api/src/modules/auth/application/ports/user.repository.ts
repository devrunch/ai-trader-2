import type { User } from '../../domain/user.js';
export interface UserRepository {
  findByUsername(username: string, signal?: AbortSignal): Promise<User | null>;
  findById(id: string, signal?: AbortSignal): Promise<User | null>;
  recordFailure(id: string, now: Date, signal?: AbortSignal): Promise<void>;
  resetFailures(id: string, signal?: AbortSignal): Promise<void>;
  upsertAdmin(username: string, passwordHash: string, signal?: AbortSignal): Promise<void>;
}
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export type UserRecord = Pick<User, 'id' | 'username' | 'role'>;
