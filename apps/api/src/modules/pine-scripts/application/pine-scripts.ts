import { PINE_SCRIPT_LIMITS, type PineScriptDetail, type PineScriptSummary, type PineScriptVersion } from '@aitrader/contracts';
import { ConflictError, NotFoundError } from '../../../shared/errors';
import { dropUpTo } from '../domain/script-versions';
import { hashSource } from './script-hash';

export interface StoredScript { id: string; name: string; updatedAt: string }
export interface PineScriptStore {
  list(userId: string): Promise<PineScriptSummary[]>;
  /** Runs `fn` in one transaction; every method called on the given store joins it. */
  atomically<T>(fn: (store: PineScriptStore) => Promise<T>): Promise<T>;
  /** Serialises concurrent creates by one user so the script cap holds. */
  lockUser(userId: string): Promise<void>;
  count(userId: string): Promise<number>;
  insertScript(row: StoredScript & { userId: string }): Promise<void>;
  /** `lock` takes a row lock so concurrent saves of one script queue up. */
  find(userId: string, id: string, lock?: boolean): Promise<StoredScript | null>;
  /** Newest first. */
  versions(scriptId: string): Promise<PineScriptVersion[]>;
  source(scriptId: string, version: number): Promise<string | null>;
  addVersion(scriptId: string, row: PineScriptVersion & { source: string }): Promise<void>;
  dropVersionsUpTo(scriptId: string, version: number): Promise<void>;
  touch(scriptId: string, name: string | undefined, at: string): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
}

const notFound = (): NotFoundError => new NotFoundError('Pine script not found');

/** Per-user saved Pine scripts with a capped version history. Saving never runs the script: drafts may be broken. */
export class PineScripts {
  constructor(private readonly store: PineScriptStore, private readonly env: { id: () => string; now: () => Date }) {}

  async list(userId: string): Promise<{ scripts: PineScriptSummary[] }> {
    return { scripts: await this.store.list(userId) };
  }

  create(userId: string, input: { name: string; source: string }): Promise<PineScriptDetail> {
    return this.store.atomically(async tx => {
      await tx.lockUser(userId);
      if (await tx.count(userId) >= PINE_SCRIPT_LIMITS.scripts) {
        throw new ConflictError(`You can keep at most ${String(PINE_SCRIPT_LIMITS.scripts)} Pine scripts. Delete one first.`, { reason: 'SCRIPT_LIMIT' });
      }
      const id = this.env.id();
      const at = this.env.now().toISOString();
      await tx.insertScript({ id, userId, name: input.name, updatedAt: at });
      await tx.addVersion(id, { version: 1, source: input.source, sourceHash: hashSource(input.source), createdAt: at });
      return this.read(tx, userId, id);
    });
  }

  /** Same source as the latest version adds nothing (idempotent); a changed source adds the next version number. */
  save(userId: string, id: string, input: { name?: string | undefined; source: string }): Promise<PineScriptDetail> {
    return this.store.atomically(async tx => {
      if (!await tx.find(userId, id, true)) throw notFound();
      const at = this.env.now().toISOString();
      const hash = hashSource(input.source);
      const [latest] = await tx.versions(id);
      const changed = latest?.sourceHash !== hash;
      if (changed) {
        const version = (latest?.version ?? 0) + 1;
        await tx.addVersion(id, { version, source: input.source, sourceHash: hash, createdAt: at });
        await tx.dropVersionsUpTo(id, dropUpTo(version, PINE_SCRIPT_LIMITS.versions));
      }
      if (changed || input.name !== undefined) await tx.touch(id, input.name, at);
      return this.read(tx, userId, id);
    });
  }

  get(userId: string, id: string, version?: number): Promise<PineScriptDetail> {
    return this.read(this.store, userId, id, version);
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!await this.store.remove(userId, id)) throw notFound();
  }

  private async read(store: PineScriptStore, userId: string, id: string, version?: number): Promise<PineScriptDetail> {
    const script = await store.find(userId, id);
    if (!script) throw notFound();
    const versions = await store.versions(id);
    const latest = versions[0];
    if (!latest) throw notFound();
    const shown = version ?? latest.version;
    const source = versions.some(v => v.version === shown) ? await store.source(id, shown) : null;
    if (source === null) throw notFound();
    return { id, name: script.name, currentVersion: latest.version, sourceHash: latest.sourceHash, updatedAt: script.updatedAt, source, shownVersion: shown, versions };
  }
}
