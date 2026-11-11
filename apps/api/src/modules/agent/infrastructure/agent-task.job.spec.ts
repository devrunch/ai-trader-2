import { describe, expect, it, vi } from 'vitest';
import type { AgentTask } from '../domain/agent-task';
import { AgentTaskJob } from './agent-task.job';

const base: AgentTask = { id: 't', userId: 'u1', threadId: null, mode: 'notify', title: 'NSE:INFY above 1,500', instruction: '', state: 'active', runs: 0, maxRuns: 1,
  armed: false, trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 }, lastRunAt: null, nextRunAt: null, lastError: null, expiresAt: 0, createdAt: 0 };

async function fireWith(task: AgentTask) {
  let run: ((signal: AbortSignal) => Promise<void>) | undefined;
  const scheduler = { register: vi.fn((job: { run: (signal: AbortSignal) => Promise<void> }) => { run = job.run; return Promise.resolve(); }) };
  const tasks = { runDue: vi.fn(async (fire: (t: AgentTask, reason: string) => Promise<string | null>) => { await fire(task, 'NSE:INFY price is 1505, above 1500'); return 1; }) };
  const chat = { runInBackground: vi.fn().mockResolvedValue({ error: null, reply: 'Bought.' }) };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  await new AgentTaskJob(scheduler as never, tasks as never, chat as never, notifications).onModuleInit();
  await run?.(new AbortController().signal);
  return { chat, notifications };
}

describe('AgentTaskJob', () => {
  it('an alert notifies with the reason and a link to the symbol, and runs no model', async () => {
    const { chat, notifications } = await fireWith(base);
    expect(chat.runInBackground).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledWith({ userId: 'u1', kind: 'alert', title: 'Alert: NSE:INFY above 1,500',
      body: 'NSE:INFY price is 1505, above 1500', link: { symbol: 'NSE:INFY' } });
  });

  it('an assistant task runs in its thread and notifies with the reply', async () => {
    const { chat, notifications } = await fireWith({ ...base, mode: 'agent', threadId: 'th1', title: 'Breakout', instruction: 'buy' });
    expect(chat.runInBackground).toHaveBeenCalledWith('u1', 'th1', expect.stringContaining('buy'));
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'task', title: 'Task "Breakout" ran', link: { threadId: 'th1' } }));
  });
});
