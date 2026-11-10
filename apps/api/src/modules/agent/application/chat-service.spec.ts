import { describe, expect, it, vi } from 'vitest';
import { RateLimitedError, UnavailableError } from '../../../shared/errors';
import { ChatService, type AgentRunner, type ChatStores, type RunInput } from './chat-service';

const prompt = { key: 'system', version: 3, content: 'be careful', source: 'admin' as const };
const opts = { dailyTurns: 2, maxRounds: 4, turnTimeoutMs: 30_000, maxTokens: 10_000 };

function setup(runner: AgentRunner | null = fakeRunner()) {
  const fns = { start: vi.fn().mockResolvedValue(undefined), finish: vi.fn().mockResolvedValue(undefined),
    ensure: vi.fn().mockResolvedValue([{ id: 'old', role: 'user', parts: [] }]), saveMessages: vi.fn().mockResolvedValue(undefined) };
  const stores: ChatStores = { turns: { start: fns.start, finish: fns.finish }, threads: { ensure: fns.ensure, saveMessages: fns.saveMessages } };
  const taken: string[] = [];
  const limiter = { take: vi.fn((key: string, limit: number) => { taken.push(key); return Promise.resolve(taken.filter(k => k === key).length <= limit); }) };
  const service = new ChatService(runner, { active: vi.fn().mockResolvedValue(prompt) }, stores, limiter, opts,
    { now: () => Date.parse('2026-11-10T20:00:00Z'), id: () => 'turn-1' });
  return { service, stores: fns, limiter };
}

function fakeRunner(outcome = { outcome: 'ok', tokens: 120, messages: [{ id: 'a1' }] }): AgentRunner & { last?: RunInput } {
  const runner: AgentRunner & { last?: RunInput } = {
    model: 'bedrock-mantle/deepseek.v3.2',
    run(input) { runner.last = input; return { stream: new ReadableStream(), done: Promise.resolve(outcome) }; },
  };
  return runner;
}

const turn = { userId: 'u1', threadId: '7d9f0a2e-0000-4000-8000-000000000001', message: { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] } };

describe('ChatService (FR-AG-1..3, FR-AG-9)', () => {
  it('is disabled cleanly without a configured model', async () => {
    const { service } = setup(null);
    expect(service.status()).toEqual({ enabled: false, model: null });
    await expect(service.start(turn, new AbortController().signal)).rejects.toBeInstanceOf(UnavailableError);
  });

  it('runs a turn with the active prompt version and records it from start to finish', async () => {
    const runner = fakeRunner();
    const { service, stores } = setup(runner);
    await service.start(turn, new AbortController().signal);
    expect(runner.last?.system).toBe('be careful');
    expect(runner.last?.messages).toEqual([{ id: 'old', role: 'user', parts: [] }, turn.message]);
    expect(stores.ensure).toHaveBeenCalledWith('u1', turn.threadId, 'hi');
    expect(runner.last?.ctx).toEqual({ userId: 'u1', conversationId: turn.threadId, turnId: 'turn-1' });
    expect(stores.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'turn-1', promptKey: 'system', promptVersion: 3, model: 'bedrock-mantle/deepseek.v3.2' }));
    await vi.waitFor(() => { expect(stores.finish).toHaveBeenCalledWith('turn-1', expect.objectContaining({ outcome: 'ok', tokens: 120 })); });
    expect(stores.saveMessages).toHaveBeenCalledWith('u1', turn.threadId, [{ id: 'a1' }]);
  });

  it('enforces the daily turn cap per user and IST day', async () => {
    const { service, limiter } = setup();
    await service.start(turn, new AbortController().signal);
    await service.start(turn, new AbortController().signal);
    await expect(service.start(turn, new AbortController().signal)).rejects.toBeInstanceOf(RateLimitedError);
    // 20:00 UTC is 01:30 IST the next day.
    expect(limiter.take).toHaveBeenCalledWith('agent:daily:u1:2026-11-11', 2, expect.any(Number));
  });

  it('gives the runner a budget with the configured ceilings and a deadline signal', async () => {
    const runner = fakeRunner();
    const { service } = setup(runner);
    await service.start(turn, new AbortController().signal);
    expect(runner.last?.budget.remaining()).toMatchObject({ rounds: 4, tokens: 10_000 });
    expect(runner.last?.signal.aborted).toBe(false);
  });

  it('a failed run is recorded as an error, not lost', async () => {
    const runner: AgentRunner = { model: 'x/y', run: () => ({ stream: new ReadableStream(), done: Promise.reject(new Error('boom')) }) };
    const { service, stores } = setup(runner);
    await service.start(turn, new AbortController().signal);
    await vi.waitFor(() => { expect(stores.finish).toHaveBeenCalledWith('turn-1', expect.objectContaining({ outcome: 'error' })); });
  });
});
