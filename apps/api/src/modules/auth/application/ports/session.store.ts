import type { UserRole } from '../../domain/user.js';
export interface Session { userId: string; role: UserRole; createdAt: string }
export interface SessionStore { create(session: Session, signal?: AbortSignal): Promise<string>; get(id: string, signal?: AbortSignal): Promise<Session | null>; delete(id: string, signal?: AbortSignal): Promise<void> }
export const SESSION_STORE = Symbol('SESSION_STORE');
