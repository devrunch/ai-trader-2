import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { SessionStore, Session } from '../application/ports/session.store.js';
const sessionSchema = z.object({ userId: z.uuid(), role: z.enum(['admin', 'user']), createdAt: z.iso.datetime() });
const ttlSeconds = 12 * 60 * 60;
export class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: Redis) {}
  async create(session: Session, signal?: AbortSignal): Promise<string> { signal?.throwIfAborted(); const id = randomBytes(32).toString('base64url'); await this.redis.set(`session:${id}`, JSON.stringify(session), 'EX', ttlSeconds); signal?.throwIfAborted(); return id; }
  async get(id: string, signal?: AbortSignal): Promise<Session | null> { signal?.throwIfAborted(); const key = `session:${id}`; const raw = await this.redis.get(key); if (!raw) return null; const payload: unknown = JSON.parse(raw); const parsed = sessionSchema.safeParse(payload); if (!parsed.success) { await this.redis.del(key); return null; } await this.redis.expire(key, ttlSeconds); signal?.throwIfAborted(); return parsed.data; }
  async delete(id: string, signal?: AbortSignal): Promise<void> { signal?.throwIfAborted(); await this.redis.del(`session:${id}`); }
}
