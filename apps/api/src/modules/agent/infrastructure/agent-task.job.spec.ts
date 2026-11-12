import { describe, expect, it, vi } from 'vitest';
import type { AgentTask } from '../domain/agent-task';
import { BackgroundRuns } from '../application/agent-trader';
import { AgentTaskJob } from './agent-task.job';

const base: AgentTask = { id: 't', userId: 'u1', threadId: null, mode: 'notify', title: 'NSE:INFY above 1,500', instruction: '', state: 'active', runs: 0, maxRuns: 1,
  armed: false, trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 }, lastRunAt: null, nextRunAt: null, lastError: null, lastOutcome: null, autoTrade: null, seen: [], expiresAt: 0, createdAt: 0 };
const watchTask: AgentTask = { ...base, mode: 'agent', threadId: 'th1', title: 'News: india (high+)', instruction: 'Does it matter?',
  trigger: { kind: 'news', markets: ['india'], symbols: [], keywords: [], minImpact: 'high' } };

async function fireWith(task: AgentTask, reply = 'Bought.', limits: { allow?: boolean } = {}) {
  let run: ((signal: AbortSignal) => Promise<void>) | undefined;
  let result: unknown;
  const scheduler = { register: vi.fn((job: { run: (signal: AbortSignal) => Promise<void> }) => { run = job.run; return Promise.resolve(); }) };
  const tasks = { runDue: vi.fn(async (fire: (t: AgentTask, reason: string) => Promise<unknown>) => { result = await fire(task, 'NSE:INFY price is 1505, above 1500'); return 1; }) };
  const chat = { runInBackground: vi.fn().mockResolvedValue({ error: null, reply }) };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  const limiter = { take: vi.fn().mockResolvedValue(limits.allow ?? true) };
  await new AgentTaskJob(scheduler as never, tasks as never, chat as never, notifications, { limiter, dailyRuns: 40, now: () => 86_400_000 * 5 }, new BackgroundRuns()).onModuleInit();
  await run?.(new AbortController().signal);
  return { chat, notifications, limiter, result };
}

describe('AgentTaskJob', () => {
  it('an alert notifies with the reason and a link to the symbol, and runs no model', async () => {
    const { chat, notifications, result } = await fireWith(base);
    expect(chat.runInBackground).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledWith({ userId: 'u1', kind: 'alert', title: 'Alert: NSE:INFY above 1,500',
      body: 'NSE:INFY price is 1505, above 1500', link: { symbol: 'NSE:INFY' } });
    expect(result).toEqual({ error: null, outcome: 'notified' });
  });

  it('an assistant task runs in its thread and notifies with the reply', async () => {
    const { chat, notifications, limiter, result } = await fireWith({ ...base, mode: 'agent', threadId: 'th1', title: 'Breakout', instruction: 'buy' });
    expect(chat.runInBackground).toHaveBeenCalledWith('u1', 'th1', expect.stringContaining('buy'));
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'task', title: 'Task "Breakout" ran', link: { threadId: 'th1' } }));
    expect(limiter.take).not.toHaveBeenCalled();
    expect(result).toEqual({ error: null, outcome: 'ran' });
  });

  it('a watch reply starting REPORT: notifies the user with the text after it', async () => {
    const { chat, notifications, result } = await fireWith(watchTask, 'REPORT: RBI cut the repo rate\nBanks should rally.');
    expect(chat.runInBackground).toHaveBeenCalledWith('u1', 'th1', expect.stringContaining('REPORT:'));
    expect(notifications.notify).toHaveBeenCalledExactlyOnceWith({ userId: 'u1', kind: 'task', title: 'Watch: News: india (high+)',
      body: 'RBI cut the repo rate\nBanks should rally.', link: { threadId: 'th1' } });
    expect(result).toEqual({ error: null, outcome: 'report' });
  });

  it('a watch reply starting SILENT: (or anything else) notifies nobody and is logged as silent', async () => {
    for (const reply of ['SILENT: routine headline', 'Nothing much here.']) {
      const { notifications, result } = await fireWith(watchTask, reply);
      expect(notifications.notify).not.toHaveBeenCalled();
      expect(result).toEqual({ error: null, outcome: 'silent' });
    }
  });

  it('a watch over the per-user daily cap does not wake the assistant', async () => {
    const { chat, notifications, limiter, result } = await fireWith(watchTask, 'REPORT: x', { allow: false });
    expect(limiter.take).toHaveBeenCalledWith('watch:u1:5', 40, 86_400_000);
    expect(chat.runInBackground).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(result).toEqual({ error: null, outcome: 'capped' });
  });
});
