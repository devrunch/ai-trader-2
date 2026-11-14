import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DataGaps, subjectOf } from './data-gaps';
import { guardedTool } from './guarded-tool';

const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };

describe('DataGaps', () => {
  it('records a tool answer with no data, with what it was about and why', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const gaps = new DataGaps({ record, list: vi.fn() }, vi.fn());
    const tool = guardedTool({ name: 'getFundamentals', description: '', input: z.object({ symbol: z.string() }), run: () => Promise.resolve({ available: false, reason: 'no fundamentals for this company yet' }) },
      { limiter: { take: () => Promise.resolve(true) }, audit: entry => { gaps.note(entry); } });
    await tool.call(ctx, { symbol: 'NSE:XYZ' });
    expect(record).toHaveBeenCalledWith({ tool: 'getFundamentals', subject: 'NSE:XYZ', reason: 'NO_DATA: no fundamentals for this company yet', example: null });
  });

  it('ignores answers with data and mistakes that are the model\'s or the limiter\'s', () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const gaps = new DataGaps({ record, list: vi.fn() }, vi.fn());
    for (const outcome of ['ok', 'INVALID_INPUT', 'RATE_LIMITED', 'NOT_LOADED']) gaps.note({ tool: 't', args: {}, outcome });
    expect(record).not.toHaveBeenCalled();
  });

  it('names the subject from the symbol, the symbols or the query', () => {
    expect(subjectOf({ symbol: 'NSE:INFY' })).toBe('NSE:INFY');
    expect(subjectOf({ symbols: ['NSE:A', 'NSE:B'] })).toBe('NSE:A, NSE:B');
    expect(subjectOf({ query: 'FII flows' })).toBe('FII flows');
    expect(subjectOf(null)).toBe('');
  });
});
