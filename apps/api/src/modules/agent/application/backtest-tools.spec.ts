import { describe, expect, it, vi } from 'vitest';
import { buildBacktestTools } from './backtest-tools';

const ctx = { userId: 'u1', conversationId: '7d9f0a2e-0000-4000-8000-000000000001', turnId: 'turn-abcdef12' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };
const bars = Array.from({ length: 150 }, (_, i) => ({ time: 1_700_000_000_000 + i * 300_000, open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 1000 }));
const strategy = { entry: { kind: 'compare', left: { kind: 'series', name: 'close' }, op: 'crossesAbove', right: { kind: 'series', name: 'ema20' } },
  stopLoss: { kind: 'percent', percent: 1 } };
const response = { metrics: { totalReturnPct: 12.345, maxDrawdownPct: 4.567, tradeCount: 9, profitFactor: 1.8, sharpe: 1.234, exposurePct: 30, cagrPct: null, finalEquity: 112345 },
  inSample: null, outOfSample: null, signals: { entries: 9, exits: 9 }, equity: [], trades: [{ entryTime: bars[10]?.time ?? 0, exitTime: bars[12]?.time ?? 0, entryPrice: 110,
    exitPrice: 112, pnl: 199.456, exitReason: 'takeProfit', barsHeld: 2, quantity: 1 }] };

describe('runBacktest tool', () => {
  it('aligns indicator series to the bars by time, sends costs, and reports risk with the return', async () => {
    const execute = vi.fn().mockResolvedValue(response);
    const compute = vi.fn().mockResolvedValue({ times: bars.slice(20).map(b => b.time), plots: [{ id: 'ema', values: bars.slice(20).map(b => b.close - 1) }] });
    const tool = buildBacktestTools({ market: { bars: vi.fn().mockResolvedValue({ bars }) }, compute, backtest: { execute } }, deps)[0];
    const result = await tool?.call(ctx, { symbol: 'NSE:INFY', interval: '5', bars: 150, indicators: [{ name: 'ema20', indicatorId: 'ema', inputs: { length: 20 } }], strategy });
    expect(result).toMatchObject({ ok: true, data: { metrics: { totalReturnPct: 12.35, maxDrawdownPct: 4.57, tradeCount: 9 }, costs: { commissionPct: 0.03, slippagePct: 0.02 },
      sample: { bars: 150 }, lastTrades: [{ pnl: 199.46, exitReason: 'takeProfit' }] } });
    const sent = execute.mock.calls[0]?.[0] as { series: Record<string, Array<number | null>>; strategy: unknown };
    expect(sent.series.ema20?.slice(0, 20).every(v => v === null)).toBe(true);
    expect(sent.series.ema20?.[20]).toBe(bars[20] ? bars[20].close - 1 : NaN);
    expect(sent.strategy).toMatchObject({ side: 'long' });
  });

  it('says plainly when backtesting is not configured, and refuses a malformed strategy', async () => {
    const tool = buildBacktestTools({ market: { bars: vi.fn() }, compute: vi.fn(), backtest: null }, deps)[0];
    expect(await tool?.call(ctx, { symbol: 'NSE:INFY', interval: '5', strategy })).toMatchObject({ ok: false, reason: 'VALIDATION_FAILED',
      detail: expect.stringContaining('COMPUTE_URL') as unknown });
    expect(await tool?.call(ctx, { symbol: 'NSE:INFY', interval: '5', strategy: { entry: { kind: 'compare', op: 'gt' } } })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
  });
});
