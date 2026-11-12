import { describe, expect, it, vi } from 'vitest';
import type { AgentTask } from '../domain/agent-task';
import { AgentTaskJob } from './agent-task.job';

const base: AgentTask = { id: 't', userId: 'u1', threadId: null, mode: 'notify', title: 'NSE:INFY above 1,500', instruction: '', state: 'active', runs: 0, maxRuns: 1,
  armed: false, trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 }, lastRunAt: null, nextRunAt: null, lastError: null, lastOutcome: null, autoTrade: null, desk: null,
  runState: 'idle', runStateAt: null, pendingFire: null, seen: [], expiresAt: 0, createdAt: 0 };
const agentTask: AgentTask = { ...base, mode: 'agent', threadId: 'th1', title: 'Breakout', instruction: 'buy' };

function setup() {
  let run: ((signal: AbortSignal) => Promise<void>) | undefined;
  const scheduler = { register: vi.fn((job: { run: (signal: AbortSignal) => Promise<void> }) => { run = job.run; return Promise.resolve(); }) };
  const tasks = { runDue: vi.fn().mockResolvedValue(0) };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined), stats: vi.fn() };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  const job = new AgentTaskJob(scheduler as never, tasks as never, queue, notifications);
  return { job, tasks, queue, notifications, tick: async () => { await job.onModuleInit(); await run?.(new AbortController().signal); } };
}

describe('AgentTaskJob', () => {
  it('each minute hands itself to runDue as the dispatcher', async () => {
    const { tick, tasks, job } = setup();
    await tick();
    expect(tasks.runDue).toHaveBeenCalledWith(job, expect.any(AbortSignal));
  });

  it('only tasks that run the assistant or the desk are queued; plain alerts are sent inline', () => {
    const { job } = setup();
    expect(job.queues(base)).toBe(false);
    expect(job.queues({ ...base, mode: 'agent' })).toBe(false);
    expect(job.queues(agentTask)).toBe(true);
    expect(job.queues({ ...agentTask, desk: { symbol: 'NSE:INFY', rounds: 1 } })).toBe(true);
  });

  it('queues a fire under the task id and the fire key, and runs no model in the tick', async () => {
    const { job, queue } = setup();
    await job.enqueue(agentTask, 'k1');
    expect(queue.enqueue).toHaveBeenCalledExactlyOnceWith({ taskId: 't', userId: 'u1', key: 'k1' });
  });

  it('an alert notifies with the reason and a link to the symbol', async () => {
    const { job, notifications } = setup();
    expect(await job.runInline(base, 'NSE:INFY price is 1505, above 1500')).toEqual({ error: null, outcome: 'notified' });
    expect(notifications.notify).toHaveBeenCalledWith({ userId: 'u1', kind: 'alert', title: 'Alert: NSE:INFY above 1,500', body: 'NSE:INFY price is 1505, above 1500', link: { symbol: 'NSE:INFY' } });
  });
});
