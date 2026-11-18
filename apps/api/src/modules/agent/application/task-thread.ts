import { createHash } from 'node:crypto';

/**
 * Assistant tasks report into a chat thread. Tasks the assistant creates by itself (a release it watches, a followed What to watch item)
 * have no conversation, so each user has one fixed "Tasks" thread for them; its id is derived from the user id, so it is the same every time.
 */
export const TASKS_THREAD_TITLE = 'Tasks';

export function taskThreadId(userId: string): string {
  const h = createHash('sha256').update(`tasks-thread:${userId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}
