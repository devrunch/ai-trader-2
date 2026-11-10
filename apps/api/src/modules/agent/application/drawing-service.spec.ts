import type { BarsResponse } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { DrawingService } from './drawing-service';

const page = (bars: Array<{ time: number; high: number; low: number; close: number }>): BarsResponse => ({
  instrumentId: 'NSE:INFY', resolvedId: 'NSE:INFY', interval: '5', nextBefore: null, status: { state: 'ok' },
  bars: bars.map(b => ({ ...b, open: b.close, volume: null })),
} as unknown as BarsResponse);

describe('DrawingService', () => {
  it('reads the latest window for levels and trend lines', async () => {
    const bars = vi.fn().mockResolvedValue(page([{ time: 1, high: 2, low: 1, close: 1.5 }]));
    const result = await new DrawingService({ bars }).compute({ kind: 'levels', symbol: 'NSE:INFY', interval: '5', bars: 300, count: 3 });
    expect(bars).toHaveBeenCalledWith('NSE:INFY', '5', { latest: true }, 300);
    expect(result).toMatchObject({ symbol: 'NSE:INFY', interval: '5', barsUsed: 1, lastBarTime: 1, status: { state: 'ok' } });
  });

  it('reads backwards from the end of a range, so old ranges work too', async () => {
    const bars = vi.fn().mockResolvedValue(page([{ time: 10, high: 5, low: 1, close: 3 }, { time: 20, high: 7, low: 2, close: 4 }]));
    const result = await new DrawingService({ bars }).compute({ kind: 'range', symbol: 'NSE:INFY', interval: '5', from: 10, to: 20 });
    expect(bars).toHaveBeenCalledWith('NSE:INFY', '5', { before: 21 }, 1000);
    expect(result.segments.map(s => s.from.price)).toEqual([7, 1]);
  });
});
