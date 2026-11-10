import { ComputeHttpError, ComputeResponseError, type BacktestRequest, type BacktestResponse, type ComputeClient } from '@aitrader/compute-client';
import { TimeoutError } from '@aitrader/resilience';
import { describe, expect, it, vi } from 'vitest';
import { HttpComputeGateway } from './http-compute.gateway';

const request: BacktestRequest = {
  bars: [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: null }, { time: 2, open: 1, high: 1, low: 1, close: 1, volume: null }],
  strategy: { entry: { kind: 'compare', left: { kind: 'series', name: 'close' }, op: 'gt', right: { kind: 'value', value: 0 } } },
};
const metrics = {
  totalReturnPct: 0, cagrPct: 0, maxDrawdownPct: 0, sharpe: null, winRatePct: null, profitFactor: null,
  exposurePct: 0, tradeCount: 0, finalEquity: 1,
};
const response: BacktestResponse = {
  trades: [], equity: [], metrics, signals: { entries: 0, exits: 0 }, inSample: null, outOfSample: null,
};

function fakeClient(...outcomes: Array<BacktestResponse | Error>) {
  const backtest = vi.fn<ComputeClient['backtest']>();
  for (const outcome of outcomes) {
    backtest.mockImplementationOnce(() => outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome));
  }
  const client: ComputeClient = { backtest, health: vi.fn<ComputeClient['health']>() };
  return { client, backtest };
}

const httpError = (status: number, message = 'bad') =>
  new ComputeHttpError(status, { code: status === 422 ? 'VALIDATION_FAILED' : 'UNAVAILABLE', message, requestId: 'r' });

function gateway(fake: { client: ComputeClient }, now = () => 0): HttpComputeGateway {
  return new HttpComputeGateway(fake.client, { random: () => 0, now });
}

const signal = new AbortController().signal;

// SRD §10.2, E21, NFR-RB-2/3.
describe('HttpComputeGateway', () => {
  it('returns the backtest and passes the timeout and signal to the client', async () => {
    const fake = fakeClient(response);
    await expect(gateway(fake).backtest(request, signal)).resolves.toEqual({ ok: true, data: response });
    const [sent, options] = fake.backtest.mock.calls[0] ?? [];
    expect(sent).toBe(request);
    expect(options?.timeoutMs).toBe(15000);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('retries a transport failure, then succeeds', async () => {
    const fake = fakeClient(new TypeError('fetch failed'), response);
    await expect(gateway(fake).backtest(request, signal)).resolves.toEqual({ ok: true, data: response });
    expect(fake.backtest).toHaveBeenCalledTimes(2);
  });

  it('retries a 503 at most twice, then reports UNAVAILABLE', async () => {
    const fake = fakeClient(httpError(503), httpError(503), httpError(503), response);
    await expect(gateway(fake).backtest(request, signal)).resolves.toEqual({ ok: false, reason: 'UNAVAILABLE' });
    expect(fake.backtest).toHaveBeenCalledTimes(3);
  });

  it('reports INVALID with the service message for a 422 and does not retry', async () => {
    const fake = fakeClient(httpError(422, 'unknown series \'atr\''));
    await expect(gateway(fake).backtest(request, signal)).resolves.toEqual({ ok: false, reason: 'INVALID', detail: 'unknown series \'atr\'' });
    expect(fake.backtest).toHaveBeenCalledTimes(1);
  });

  it('reports UNAVAILABLE on a timeout without retrying', async () => {
    const fake = fakeClient(new TimeoutError());
    await expect(gateway(fake).backtest(request, signal)).resolves.toEqual({ ok: false, reason: 'UNAVAILABLE' });
    expect(fake.backtest).toHaveBeenCalledTimes(1);
  });

  it('reports UNAVAILABLE when the response breaks the contract', async () => {
    const fake = fakeClient(new ComputeResponseError('mismatch'));
    await expect(gateway(fake).backtest(request, signal)).resolves.toEqual({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('opens the breaker after three failed calls and answers at once while open (E21)', async () => {
    let now = 0;
    const fake = fakeClient(new TimeoutError(), new TimeoutError(), new TimeoutError(), response);
    const gw = gateway(fake, () => now);
    for (let i = 0; i < 3; i++) await gw.backtest(request, signal);
    await expect(gw.backtest(request, signal)).resolves.toEqual({ ok: false, reason: 'UNAVAILABLE' });
    expect(fake.backtest).toHaveBeenCalledTimes(3);
    now = 30_000;
    await expect(gw.backtest(request, signal)).resolves.toEqual({ ok: true, data: response });
  });

  it('does not count invalid requests towards the breaker', async () => {
    const fake = fakeClient(httpError(422), httpError(422), httpError(422), response);
    const gw = gateway(fake);
    for (let i = 0; i < 3; i++) await gw.backtest(request, signal);
    await expect(gw.backtest(request, signal)).resolves.toEqual({ ok: true, data: response });
  });

  it('rethrows when the caller aborts', async () => {
    const controller = new AbortController();
    const fake = fakeClient(new TypeError('fetch failed'));
    fake.backtest.mockReset().mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(new TypeError('fetch failed'));
    });
    await expect(gateway(fake).backtest(request, controller.signal)).rejects.toThrow();
  });
});
