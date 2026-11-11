import { ConflictError, NotFoundError } from '../../../shared/errors';

export interface MemoryNote { id: string; note: string; createdAt: string }
export interface MemoryStore {
  list(userId: string): Promise<MemoryNote[]>;
  add(userId: string, note: { id: string; note: string }): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
}

const MAX_NOTES = 30;

/**
 * Lasting facts about the user (risk per trade, style, instruments they trade), kept across conversations and shown to
 * the assistant at the start of every turn. The user sees and deletes them; the assistant writes them only for lasting facts.
 */
export class AgentMemory {
  constructor(private readonly store: MemoryStore, private readonly env: { id: () => string }) {}

  list(userId: string): Promise<MemoryNote[]> { return this.store.list(userId); }

  async remember(userId: string, raw: string): Promise<MemoryNote[]> {
    const note = raw.replace(/\s+/g, ' ').trim().slice(0, 300);
    const notes = await this.store.list(userId);
    if (notes.some(n => n.note.toLowerCase() === note.toLowerCase())) return notes;
    if (notes.length >= MAX_NOTES) throw new ConflictError(`Memory holds at most ${String(MAX_NOTES)} notes; forget one first`);
    await this.store.add(userId, { id: this.env.id(), note });
    return this.store.list(userId);
  }

  /** By id, or by the 8-character prefix the assistant sees in its prompt. */
  async forget(userId: string, id: string): Promise<void> {
    const match = (await this.store.list(userId)).find(n => n.id === id || (id.length >= 8 && n.id.startsWith(id)));
    if (!match || !(await this.store.remove(userId, match.id))) throw new NotFoundError('Memory note not found', { id });
  }

  /** The block appended to the system prompt; empty when there is nothing to remember. */
  async promptFor(userId: string): Promise<string> {
    const notes = await this.store.list(userId).catch(() => []);
    if (notes.length === 0) return '';
    return `\n\n## What you remember about this user\nFacts they told you earlier; use them, and update with remember/forget when they change.\n${
      notes.map(n => `- [${n.id.slice(0, 8)}] ${n.note}`).join('\n')}`;
  }
}
