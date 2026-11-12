import { describe, expect, it, vi } from 'vitest';
import { BacktestRunner } from './backtest-runner';

const bars = Array.from({ length: 120 }, (_, i) => ({ time: 1_700_000_000_000 + i * 300_000, open: 100, high: 101, low: 99, close: 100 + i / 10, volume: 10 }));
const metrics = { totalReturnPct: 5.678, maxDrawdownPct: 2.345, tradeCount: 25, profitFactor: 1.5678, sharpe: 1.2, exposurePct: 40.123, cagrPct: null, finalEquity: 105, winRatePct: 55.55 };
const trade = (i: number) => ({ side: 'long', entryTime: i, entryPrice: 100, exitTime: i + 1, exitPrice: 101, quantity: 1, pnl: 1.234, returnPct: 1.01, barsHeld: 1, exitReason: 'takeProfit' });
const spec = { symbol: 'NSE:INFY', interval: '5' as const, bars: 120, indicators: [], costs: { commissionPct: 0.03, slippagePct: 0.02 },
  strategy: { side: 'long' as const, entry: { kind: 'compare' as const, left: { kind: 'series' as const, name: 'close' }, op: 'gt' as const, right: { kind: 'value' as const, value: 0 } } } };

describe('BacktestRunner', () => {
  it('rounds the metrics, keeps the last 300 trades and thins the equity curve to 500 points', async () => {
    const response = { metrics, inSample: { startTime: 1, endTime: 2, metrics }, outOfSample: null, signals: { entries: 25, exits: 25 },
      trades: Array.from({ length: 350 }, (_, i) => trade(i)), equity: Array.from({ length: 2000 }, (_, i) => ({ time: i, equity: 100 + i / 3 })) };
    const runner = new BacktestRunner({ market: { bars: vi.fn().mockResolvedValue({ bars }) }, compute: vi.fn(), backtest: { execute: vi.fn().mockResolvedValue(response) } });
    const result = await runner.run(spec);
    expect(result.metrics).toMatchObject({ totalReturnPct: 5.68, maxDrawdownPct: 2.35, profitFactor: 1.57, exposurePct: 40.12, cagrPct: null, winRatePct: 55.55 });
    expect(result.inSample?.metrics.totalReturnPct).toBe(5.68);
    expect(result.trades).toHaveLength(300);
    expect(result.trades[0]?.entryTime).toBe(50);
    expect(result.equity).toHaveLength(500);
    expect(result.equity[0]?.time).toBe(0);
    expect(result.equity.at(-1)?.time).toBe(1999);
  });

  it('refuses when backtesting is not configured, and when there are too few bars', async () => {
    await expect(new BacktestRunner({ market: { bars: vi.fn() }, compute: vi.fn(), backtest: null }).run(spec)).rejects.toThrow('COMPUTE_URL');
    const few = new BacktestRunner({ market: { bars: vi.fn().mockResolvedValue({ bars: bars.slice(0, 50) }) }, compute: vi.fn(), backtest: { execute: vi.fn() } });
    await expect(few.run(spec)).rejects.toThrow('Only 50 bars');
  });
});
