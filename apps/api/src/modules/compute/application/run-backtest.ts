import type { BacktestRequest, BacktestResponse } from '@aitrader/compute-client';
import { UnavailableError, ValidationError } from '../../../shared/errors';
import type { ComputeGateway } from './ports/compute-gateway';

export class RunBacktest {
  constructor(private readonly compute: ComputeGateway) {}

  async execute(request: BacktestRequest, signal: AbortSignal): Promise<BacktestResponse> {
    const result = await this.compute.backtest(request, signal);
    if (result.ok) return result.data;
    if (result.reason === 'INVALID') throw new ValidationError(result.detail);
    throw new UnavailableError('Backtesting is unavailable right now');
  }
}
