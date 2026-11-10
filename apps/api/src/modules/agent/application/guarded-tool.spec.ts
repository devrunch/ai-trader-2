import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { NotFoundError } from '../../../shared/errors';
import { guardedTool, type ToolContext } from './guarded-tool';

const ctx: ToolContext = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
function deps(allow = true) {
  return { limiter: { take: vi.fn().mockResolvedValue(allow) }, audit: vi.fn() };
}
const quote = (run: (symbol: string) => Promise<unknown>, d = deps()) =>
  guardedTool({ name: 'getQuote', description: 'Last price', input: z.object({ symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/) }),
    run: input => run(input.symbol) }, d);

describe('guardedTool (FR-AG-5)', () => {
  it('validates, runs, and audits a successful call', async () => {
    const d = deps();
    const result = await quote(symbol => Promise.resolve({ symbol, price: 1325 }), d).call(ctx, { symbol: 'NSE:RELIANCE' });
    expect(result).toEqual({ ok: true, data: { symbol: 'NSE:RELIANCE', price: 1325 } });
    expect(d.limiter.take).toHaveBeenCalledWith('agent:getQuote:user:u1');
    expect(d.limiter.take).toHaveBeenCalledWith('agent:conversation:c1');
    expect(d.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', conversationId: 'c1', turnId: 't1', tool: 'getQuote', args: { symbol: 'NSE:RELIANCE' }, outcome: 'ok' }));
  });

  it('rejects invalid input with a typed reason and never runs', async () => {
    const run = vi.fn();
    expect(await quote(run).call(ctx, { symbol: 'reliance; drop table' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
    expect(run).not.toHaveBeenCalled();
  });

  it('a rate-limited call returns RATE_LIMITED and never runs', async () => {
    const run = vi.fn();
    expect(await quote(run, deps(false)).call(ctx, { symbol: 'NSE:RELIANCE' })).toEqual({ ok: false, reason: 'RATE_LIMITED' });
    expect(run).not.toHaveBeenCalled();
  });

  it('maps domain errors to their code and anything else to UNAVAILABLE, never throwing', async () => {
    expect(await quote(() => Promise.reject(new NotFoundError('No price yet'))).call(ctx, { symbol: 'NSE:X' })).toEqual({ ok: false, reason: 'NOT_FOUND', detail: 'No price yet' });
    expect(await quote(() => Promise.reject(new Error('socket hang up'))).call(ctx, { symbol: 'NSE:X' })).toEqual({ ok: false, reason: 'UNAVAILABLE' });
  });
});
