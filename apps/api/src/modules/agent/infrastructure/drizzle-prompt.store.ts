import { desc, eq } from 'drizzle-orm';
import { withTimeout } from '@aitrader/resilience';
import type { Database } from '../../../shared/database';
import { promptVersions } from '../../../shared/database/schema';
import { ConflictError } from '../../../shared/errors';
import type { PromptVersion } from '../domain/prompt-history';
import type { PromptStore } from '../application/prompt-registry';

const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (error: unknown): boolean => {
  const cause: unknown = error instanceof Error && 'cause' in error ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === UNIQUE_VIOLATION;
};

export class DrizzlePromptStore implements PromptStore {
  constructor(private readonly db: Database) {}

  async history(key: string): Promise<PromptVersion[]> {
    const rows = await withTimeout(() => this.db.select().from(promptVersions).where(eq(promptVersions.key, key)).orderBy(desc(promptVersions.version)), 5000);
    return rows.map(row => ({ key: row.key, version: row.version, content: row.content, parentVersion: row.parentVersion,
      message: row.message, author: row.author, createdAt: new Date(row.createdAt).toISOString() }));
  }

  /** Two editors saving at once: the second gets 409 and must reload, never a silent overwrite. */
  async append(version: PromptVersion): Promise<void> {
    try {
      await withTimeout(() => this.db.insert(promptVersions).values({ key: version.key, version: version.version, content: version.content,
        parentVersion: version.parentVersion, message: version.message, author: version.author, createdAt: version.createdAt }), 5000);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('Prompt changed meanwhile; reload and try again', { key: version.key, version: version.version });
      throw error;
    }
  }
}
