import { NotFoundError } from '../../../shared/errors';

export interface ThreadSummary { id: string; title: string; updatedAt: string }
export interface ThreadStore {
  list(userId: string): Promise<ThreadSummary[]>;
  messages(userId: string, threadId: string): Promise<unknown[] | null>;
  rename(userId: string, threadId: string, title: string): Promise<boolean>;
  remove(userId: string, threadId: string): Promise<boolean>;
}

/** Chat threads per user (FR-AG-9): list, open, rename and delete. Another user's thread reads as not found. */
export class Threads {
  constructor(private readonly store: ThreadStore) {}
  list(userId: string): Promise<ThreadSummary[]> { return this.store.list(userId); }
  async messages(userId: string, threadId: string): Promise<unknown[]> {
    const messages = await this.store.messages(userId, threadId);
    if (!messages) throw new NotFoundError('Chat not found', { threadId });
    return messages;
  }
  async rename(userId: string, threadId: string, title: string): Promise<void> {
    if (!(await this.store.rename(userId, threadId, title))) throw new NotFoundError('Chat not found', { threadId });
  }
  async remove(userId: string, threadId: string): Promise<void> {
    if (!(await this.store.remove(userId, threadId))) throw new NotFoundError('Chat not found', { threadId });
  }
}
