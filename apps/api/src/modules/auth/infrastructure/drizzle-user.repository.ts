import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../../shared/database/index.js';
import { users } from '../../../shared/database/schema/users.js';
import type { UserRepository } from '../application/ports/user.repository.js';
import type { User } from '../domain/user.js';
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}
  async findByUsername(username: string, signal?: AbortSignal): Promise<User | null> { signal?.throwIfAborted(); const [row] = await this.db.select().from(users).where(eq(users.username, username)).limit(1); signal?.throwIfAborted(); return row ? { id: row.id, username: row.username, role: row.role, passwordHash: row.passwordHash, disabled: row.disabled, failedLogins: row.failedLogins, lockedUntil: row.lockedUntil } : null; }
  async findById(id: string, signal?: AbortSignal): Promise<User | null> { signal?.throwIfAborted(); const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1); signal?.throwIfAborted(); return row ? { id: row.id, username: row.username, role: row.role, passwordHash: row.passwordHash, disabled: row.disabled, failedLogins: row.failedLogins, lockedUntil: row.lockedUntil } : null; }
  async recordFailure(id: string, now: Date, signal?: AbortSignal): Promise<void> { signal?.throwIfAborted(); await this.db.update(users).set({ failedLogins: sql`least(${users.failedLogins} + 1, 5)`, lockedUntil: sql`case when ${users.failedLogins} + 1 >= 5 then ${now}::timestamptz + interval '15 minutes' else ${users.lockedUntil} end` }).where(eq(users.id, id)); }
  async resetFailures(id: string, signal?: AbortSignal): Promise<void> { signal?.throwIfAborted(); await this.db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, id)); }
  async upsertAdmin(username: string, passwordHash: string, signal?: AbortSignal): Promise<void> { signal?.throwIfAborted(); await this.db.insert(users).values({ username, passwordHash, role: 'admin' }).onConflictDoUpdate({ target: users.username, set: { passwordHash, role: 'admin', disabled: false, failedLogins: 0, lockedUntil: null } }); }
}
