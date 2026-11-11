import { Module } from '@nestjs/common';
import { createComputeClient } from '@aitrader/compute-client';
import { APP_CONFIG, type AppConfig } from '../../shared/config';
import { RunBacktest } from './application/run-backtest';
import { HttpComputeGateway } from './infrastructure/http-compute.gateway';
import { lambdaUrlRegion, sigv4Fetch } from './infrastructure/sigv4-fetch';

/** RunBacktest, or null when COMPUTE_URL is not set (backtesting is then off and the assistant says so). */
export const BACKTEST = Symbol('BACKTEST');

export function backtestFor(config: AppConfig): RunBacktest | null {
  if (!config.COMPUTE_URL) return null;
  const region = lambdaUrlRegion(config.COMPUTE_URL);
  if (region && !(config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY)) {
    throw new Error('COMPUTE_URL is a Lambda Function URL: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to sign requests');
  }
  const fetch = region && config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY
    ? sigv4Fetch(region, { accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY, sessionToken: config.AWS_SESSION_TOKEN })
    : undefined;
  // A cold Lambda start with numpy takes a few seconds: allow 25 s, under the function's 30 s.
  return new RunBacktest(new HttpComputeGateway(createComputeClient({ baseUrl: config.COMPUTE_URL, ...(fetch ? { fetch } : {}) }), { timeoutMs: 25_000 }));
}

@Module({
  providers: [{ provide: BACKTEST, inject: [APP_CONFIG], useFactory: backtestFor }],
  exports: [BACKTEST],
})
export class ComputeModule {}
