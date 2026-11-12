import { describe, expect, it, vi } from 'vitest';
import { RateLimitedError, ValidationError } from '../../../shared/errors';
import type { AgentTask } from '../domain/agent-task';
import { isRetryable, RunProcessor } from './run-processor';

const queued: AgentTask = { id: 't', userId: 'u1', threadId: 'th1', mode: 'agent', title: 'x', instruction: 'i', state: 'active', runs: 0, maxRuns: 3, armed: false,
  trigger: { kind: 'price', symbol: 'NSE:INFY', op: 'above', value: 1500 }, lastRunAt: null, nextRunAt: null, lastError: null, lastOutcome: null, autoTrade: null, desk: null,
  runState: 'queued', runStateAt: 1, pendingFire: { key: 'k1', reason: 'price crossed' }, seen: [], expiresAt: 1e12, createdAt: 0 };
const job = { taskId: 't', userId: 'u1', key: 'k1', attempt: 1, attempts: 3 };

function setup(task: AgentTask | null = queued, fire = vi.fn().mockResolvedValue({ error: null, outcome: 'ran' })) {
  const saved: AgentTask[] = [];
  const store = { get: vi.fn().mockResolvedValue(task), save: vi.fn((t: AgentTask) => { saved.push(t); return Promise.resolve(); }) };
  return { processor: new RunProcessor(store, { fire }, { now: () => 1000 }, { agentMs: 120_000, deskMs: 240_000 }), saved, fire, store };
}

describe('RunProcessor', () => {
  it('moves the task queued -> running -> idle and records the outcome and the run', async () => {
    const { processor, saved, fire } = setup();
    await processor.process(job);
    expect(fire).toHaveBeenCalledWith(queued, 'price crossed', expect.any(AbortSignal));
    expect(saved.map(t => t.runState)).toEqual(['running', 'idle']);
    expect(saved[1]).toMatchObject({ runs: 1, lastOutcome: 'ran', pendingFire: null, state: 'active', lastRunAt: 1000 });
  });

  it('a transient failure puts the task back to queued and rethrows so the queue retries it', async () => {
    const { processor, saved } = setup(queued, vi.fn().mockRejectedValue(new Error('fetch failed')));
    await expect(processor.process(job)).rejects.toThrow('fetch failed');
    expect(saved.map(t => t.runState)).toEqual(['running', 'queued']);
    expect(saved.at(-1)).toMatchObject({ runs: 0, pendingFire: { key: 'k1' } });
  });

  it('the last attempt records the error instead of throwing, and the run is not lost silently', async () => {
    const { processor, saved } = setup(queued, vi.fn().mockRejectedValue(new Error('fetch failed')));
    await processor.process({ ...job, attempt: 3 });
    expect(saved.at(-1)).toMatchObject({ runState: 'idle', lastOutcome: 'error', lastError: 'fetch failed', runs: 1, pendingFire: null });
  });

  it('a validation failure is not retried: it is recorded at once', async () => {
    const { processor, saved, fire } = setup(queued, vi.fn().mockRejectedValue(new ValidationError('Risk check BLOCK')));
    await processor.process(job);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(saved.at(-1)).toMatchObject({ runState: 'idle', lastOutcome: 'error', lastError: 'Risk check BLOCK' });
    expect(isRetryable(new ValidationError('x'))).toBe(false);
    expect(isRetryable(new Error('boom'))).toBe(true);
  });

  it('a cap refused at run time is recorded as capped and does not use up a run', async () => {
    const { processor, saved } = setup(queued, vi.fn().mockRejectedValue(new RateLimitedError('Daily desk run limit reached', 1000)));
    await processor.process(job);
    expect(saved.at(-1)).toMatchObject({ lastOutcome: 'capped', runs: 0, runState: 'idle' });
  });

  it('does nothing for a job whose fire is not the task\'s pending one (a duplicate delivery or a finished run)', async () => {
    const stale = setup({ ...queued, pendingFire: { key: 'other', reason: 'r' } });
    await stale.processor.process(job);
    const finished = setup({ ...queued, runState: 'idle', pendingFire: null });
    await finished.processor.process(job);
    const missing = setup(null);
    await missing.processor.process(job);
    for (const s of [stale, finished, missing]) { expect(s.fire).not.toHaveBeenCalled(); expect(s.saved).toEqual([]); }
  });

  it('picks up a run whose worker died while it was running (state still running) and finishes it', async () => {
    const { processor, saved, fire } = setup({ ...queued, runState: 'running' });
    await processor.process({ ...job, attempt: 2 });
    expect(fire).toHaveBeenCalledOnce();
    expect(saved.at(-1)).toMatchObject({ runState: 'idle', lastOutcome: 'ran', runs: 1 });
  });

  it('a cancelled task is cleared without running', async () => {
    const { processor, saved, fire } = setup({ ...queued, state: 'cancelled' });
    await processor.process(job);
    expect(fire).not.toHaveBeenCalled();
    expect(saved.at(-1)).toMatchObject({ runState: 'idle', pendingFire: null });
  });

  it('gives a desk run the longer timeout', async () => {
    const seen: number[] = [];
    const store = { get: vi.fn().mockResolvedValue({ ...queued, desk: { symbol: 'NSE:INFY', rounds: 1 } }), save: vi.fn().mockResolvedValue(undefined) };
    const spy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { seen.push(ms); return new AbortController().signal; });
    await new RunProcessor(store, { fire: vi.fn().mockResolvedValue({ error: null, outcome: 'silent' }) }, { now: () => 1 }).process(job);
    await new RunProcessor({ ...store, get: vi.fn().mockResolvedValue(queued) }, { fire: vi.fn().mockResolvedValue({ error: null, outcome: 'ran' }) }, { now: () => 1 }).process(job);
    spy.mockRestore();
    expect(seen).toEqual([240_000, 120_000]);
  });
});
