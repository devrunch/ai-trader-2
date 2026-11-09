import type { SessionStore } from './ports/session.store.js';
export class Logout { constructor(private readonly sessions: SessionStore) {} async execute(sessionId: string | undefined, signal?: AbortSignal): Promise<void> { if (sessionId) await this.sessions.delete(sessionId, signal); } }
