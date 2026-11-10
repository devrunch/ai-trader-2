import type { BacktestRequest, BacktestResponse } from '@aitrader/compute-client';
import { describe, expect, it } from 'vitest';
import { UnavailableError, ValidationError } from '../../../shared/errors';
import type { ComputeGateway, ComputeResult } from './ports/compute-gateway';
import { RunBacktest } from './run-backtest';

const request = { bars: [], strategy: { entry: { kind: 'compare', left: { kind: 'value', value: 1 }, op: 'gt', right: { kind: 'value', value: 0 } } } } satisfies BacktestRequest;
const response = { trades: [], equity: [], signals: { entries: 0, exits: 0 }, inSample: null, outOfSample: null,
  metrics: { totalReturnPct: 0, cagrPct: 0, maxDrawdownPct: 0, sharpe: null, winRatePct: null, profitFactor: null, exposurePct: 0, tradeCount: 0, finalEquity: 1 } } satisfies BacktestResponse;

const gateway = (result: ComputeResult<BacktestResponse>): ComputeGateway => ({ backtest: () => Promise.resolve(result) });
const signal = new AbortController().signal;

// E21: a down compute service fails backtests only, with a clear reason.
describe('RunBacktest', () => {
  it('returns the result', async () => {
    await expect(new RunBacktest(gateway({ ok: true, data: response })).execute(request, signal)).resolves.toBe(response);
  });

  it('throws UnavailableError when the service is unavailable', async () => {
    const run = new RunBacktest(gateway({ ok: false, reason: 'UNAVAILABLE' })).execute(request, signal);
    await expect(run).rejects.toBeInstanceOf(UnavailableError);
    await expect(run).rejects.toThrow('Backtesting is unavailable right now');
  });

  it('throws ValidationError with the service detail for an invalid request', async () => {
    const run = new RunBacktest(gateway({ ok: false, reason: 'INVALID', detail: 'unknown series' })).execute(request, signal);
    await expect(run).rejects.toBeInstanceOf(ValidationError);
    await expect(run).rejects.toThrow('unknown series');
  });
});
