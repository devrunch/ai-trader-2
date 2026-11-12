import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from '../../../shared/errors';
import { afterRun, type AgentTask } from '../domain/agent-task';
import type { FireResult, TaskStore } from './agent-tasks';

export interface RunJob { taskId: string; userId: string; key: string; /** 1-based. */ attempt: number; attempts: number }
export interface RunTimeouts { agentMs: number; deskMs: number }
const DEFAULT_RUN_TIMEOUTS: RunTimeouts = { agentMs: 120_000, deskMs: 240_000 };

/** Validation, conflict and cap refusals will not change on a second try; anything else (the model, the network, a timeout) might. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ValidationError || error instanceof ConflictError || error instanceof NotFoundError || error instanceof RateLimitedError) return false;
  return true;
}

/**
 * What a queue worker does with one job (AG-6): queued -> running -> outcome. A job whose task has moved on (cancelled, or already finished by another
 * delivery of the same job) does nothing. A retryable failure is rethrown for the queue to retry with backoff until the last attempt, which records the error.
 */
export class RunProcessor {
  constructor(private readonly store: Pick<TaskStore, 'get' | 'save'>, private readonly firer: { fire(task: AgentTask, reason: string, signal: AbortSignal): Promise<FireResult> },
    private readonly env: { now: () => number }, private readonly timeouts: RunTimeouts = DEFAULT_RUN_TIMEOUTS) {}

  async process(job: RunJob): Promise<void> {
    const task = await this.store.get(job.userId, job.taskId);
    if (!task?.pendingFire || task.pendingFire.key !== job.key) return;
    const { reason } = task.pendingFire;
    if (task.state === 'cancelled' || task.state === 'expired') { await this.store.save({ ...task, runState: 'idle', runStateAt: this.env.now(), pendingFire: null }); return; }
    await this.store.save({ ...task, runState: 'running', runStateAt: this.env.now() });
    let result: FireResult;
    try {
      result = await this.firer.fire(task, reason, AbortSignal.timeout(task.desk ? this.timeouts.deskMs : this.timeouts.agentMs));
    } catch (error) {
      if (isRetryable(error) && job.attempt < job.attempts) {
        await this.store.save({ ...task, runState: 'queued', runStateAt: this.env.now() });
        throw error;
      }
      const message = (error instanceof Error ? error.message : 'The run failed').slice(0, 300);
      result = { error: message, outcome: error instanceof RateLimitedError ? 'capped' : 'error' };
    }
    await this.store.save(afterRun({ ...task, runState: 'idle', pendingFire: null }, this.env.now(), result.error, result.outcome));
  }
}
