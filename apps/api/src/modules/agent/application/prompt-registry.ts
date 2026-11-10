import { NotFoundError } from '../../../shared/errors';
import { commit, lineDiff, revert, type DiffLine, type PromptVersion } from '../domain/prompt-history';

export type { PromptVersion } from '../domain/prompt-history';

/** Append-only version storage; `history` is newest first. */
export interface PromptStore {
  history(key: string): Promise<PromptVersion[]>;
  append(version: PromptVersion): Promise<void>;
}
/** The reviewed defaults shipped as files (`modules/agent/prompts/<key>.md`). */
export interface PromptDefaults { keys(): string[]; read(key: string): string | null }
export interface ActivePrompt { key: string; version: number; content: string; source: 'file' | 'admin' }

/**
 * Prompts the admin can change like commits (owner request 2026-11-10): every save is a new version, undo is a
 * revert, reset returns to the file default, and the newest version is the one the agent uses.
 */
export class PromptRegistry {
  constructor(private readonly store: PromptStore, private readonly defaults: PromptDefaults, private readonly clock: () => string = () => new Date().toISOString()) {}

  keys(): string[] { return this.defaults.keys(); }

  async active(key: string): Promise<ActivePrompt> {
    const fallback = this.fileDefault(key);
    const [top] = await this.store.history(key);
    return top ? { key, version: top.version, content: top.content, source: 'admin' } : { key, version: 0, content: fallback, source: 'file' };
  }

  history(key: string): Promise<PromptVersion[]> { this.fileDefault(key); return this.store.history(key); }

  save(key: string, content: string, message: string, author: string): Promise<PromptVersion | null> {
    return this.append(key, history => commit(this.withDefault(key, history), content, message, author, this.clock()));
  }

  revert(key: string, toVersion: number, author: string): Promise<PromptVersion | null> {
    return this.append(key, history => revert(this.withDefault(key, history), toVersion, author, this.clock()));
  }

  reset(key: string, author: string): Promise<PromptVersion | null> {
    return this.append(key, history => commit(this.withDefault(key, history), this.fileDefault(key), 'Reset to file default', author, this.clock()));
  }

  async diff(key: string, from: number, to: number): Promise<DiffLine[]> {
    const history = this.withDefault(key, await this.store.history(key));
    const pick = (v: number) => history.find(h => h.version === v)?.content;
    const a = pick(from); const b = pick(to);
    if (a === undefined || b === undefined) throw new NotFoundError('Prompt version not found', { key, from, to });
    return lineDiff(a, b);
  }

  private async append(key: string, next: (history: PromptVersion[]) => PromptVersion | null): Promise<PromptVersion | null> {
    const version = next(await this.store.history(key));
    if (!version) return null;
    const stored = { ...version, key };
    await this.store.append(stored);
    return stored;
  }

  /** History plus the file default as version 0, so diffs and reverts can reach it. */
  private withDefault(key: string, history: PromptVersion[]): PromptVersion[] {
    return [...history, { key, version: 0, content: this.fileDefault(key), parentVersion: null, message: 'file default', author: 'system', createdAt: '' }];
  }

  private fileDefault(key: string): string {
    const content = this.defaults.read(key);
    if (content === null) throw new NotFoundError('Unknown prompt', { key });
    return content;
  }
}
