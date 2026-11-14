import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TurnBudget } from '../domain/turn-budget';
import { guardedTool } from '../application/guarded-tool';
import { MastraRunner } from './mastra-runner';

const usage = (total: number) => ({ inputTokens: { total, noCache: total, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } });
const finish = (unified: 'stop' | 'tool-calls', tokens: number) => ({ type: 'finish' as const, finishReason: { unified, raw: unified }, usage: usage(tokens) });
const toolCallStep = () => ({ stream: convertArrayToReadableStream([
  { type: 'stream-start' as const, warnings: [] },
  { type: 'tool-call' as const, toolCallId: 'c1', toolName: 'getQuote', input: JSON.stringify({ symbol: 'NSE:RELIANCE' }) },
  finish('tool-calls', 100),
]) });
const textStep = () => ({ stream: convertArrayToReadableStream([
  { type: 'stream-start' as const, warnings: [] },
  { type: 'text-start' as const, id: 't1' }, { type: 'text-delta' as const, id: 't1', delta: 'RELIANCE is at 1325.' }, { type: 'text-end' as const, id: 't1' },
  finish('stop', 150),
]) });

const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
const user = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Price of Reliance?' }] }];

function quoteTool(run = vi.fn().mockResolvedValue({ price: 1325 })) {
  return { run, tool: guardedTool({ name: 'getQuote', description: 'quote', input: z.strictObject({ symbol: z.string() }), run },
    { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined }) };
}

async function drain(stream: ReadableStream<unknown>): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) chunks.push(chunk);
  return chunks;
}

describe('MastraRunner', () => {
  it('streams a tool-using turn as AI SDK UI chunks, with the caller context reaching the tool', async () => {
    const q = quoteTool();
    const runner = new MastraRunner({ name: 'mock/model', primary: new MockLanguageModelV4({ doStream: [toolCallStep(), textStep()] }), tools: [q.tool] });
    const { stream, done } = runner.run({ system: 'sys', messages: user, ctx, signal: new AbortController().signal,
      budget: new TurnBudget({ maxRounds: 5, maxMs: 60_000, maxTokens: 10_000 }) });
    const chunks = await drain(stream);
    expect(q.run).toHaveBeenCalledWith({ symbol: 'NSE:RELIANCE' }, ctx);
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'text-delta', delta: 'RELIANCE is at 1325.' }));
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'tool-output-available', toolCallId: 'c1' }));
    const result = await done;
    expect(result.outcome).toBe('ok');
    expect(result.tokens).toBe(270);
    expect(result.messages.length).toBe(2);
  });

  it('refuses lookups once the turn is nearly spent, even from a model that ignores tool choice', async () => {
    const q = quoteTool();
    let calls = 0;
    const model = new MockLanguageModelV4({ doStream: () => { calls++; return Promise.resolve(calls < 4 ? toolCallStep() : textStep()); } });
    const runner = new MastraRunner({ name: 'mock/model', primary: model, tools: [q.tool] });
    const { stream, done } = runner.run({ system: 'sys', messages: user, ctx, signal: new AbortController().signal,
      budget: new TurnBudget({ maxRounds: 4, maxMs: 60_000, maxTokens: 100_000 }) });
    const chunks = await drain(stream);
    expect(q.run.mock.calls.length).toBeLessThan(3);
    expect(chunks.some(c => (c as { type: string; output?: { reason?: string } }).type === 'tool-output-available' && (c as { output?: { reason?: string } }).output?.reason === 'TIME_TO_ANSWER')).toBe(true);
    expect((await done).outcome).toBe('ok');
  });

  it('ends the turn with a plain notice when the token budget runs out', async () => {
    const q = quoteTool();
    const runner = new MastraRunner({ name: 'mock/model', primary: new MockLanguageModelV4({ doStream: [toolCallStep(), textStep()] }), tools: [q.tool] });
    const { stream, done } = runner.run({ system: 'sys', messages: user, ctx, signal: new AbortController().signal,
      budget: new TurnBudget({ maxRounds: 5, maxMs: 60_000, maxTokens: 50 }) });
    const chunks = await drain(stream);
    expect(chunks.find(c => (c as { type: string }).type === 'data-notice')).toMatchObject({ data: { kind: 'budget', reason: 'tokens' } });
    expect((await done).outcome).toBe('budget:tokens');
  });

  it('falls back to the second model when the first one fails', async () => {
    const failing = new MockLanguageModelV4({ doStream: () => Promise.reject(new Error('provider down')) });
    const runner = new MastraRunner({ name: 'mock/model', primary: failing, fallback: new MockLanguageModelV4({ doStream: [textStep()] }), tools: [] });
    const { stream, done } = runner.run({ system: 'sys', messages: user, ctx, signal: new AbortController().signal,
      budget: new TurnBudget({ maxRounds: 5, maxMs: 60_000, maxTokens: 10_000 }) });
    const chunks = await drain(stream);
    expect(chunks.find(c => (c as { type: string }).type === 'text-delta')).toMatchObject({ delta: 'RELIANCE is at 1325.' });
    expect((await done).outcome).toBe('ok');
  });
});
