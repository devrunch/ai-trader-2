import type { AgentQueueStats } from '@aitrader/contracts';

/** The work queue between the minute tick and the workers. `enqueue` is idempotent on (taskId, key): the same fire twice is one job. */
export interface RunQueue {
  enqueue(job: { taskId: string; userId: string; key: string }): Promise<void>;
  stats(): Promise<AgentQueueStats>;
}

export const RUN_QUEUE = Symbol('AGENT_RUN_QUEUE');
