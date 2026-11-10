import { AbortedError, TimeoutError } from '@aitrader/resilience';
import { describe, expect, it, vi } from 'vitest';
import { ComputeHttpError, ComputeResponseError, createComputeClient } from './client.js';
import type { BacktestRequest, BacktestResponse } from './index.js';

const metrics = {
  totalReturnPct: 1, cagrPct: null, maxDrawdownPct: 0, sharpe: null, winRatePct: 100, profitFactor: null,
  exposurePct: 50, tradeCount: 1, finalEquity: 1010,
};
const response: BacktestResponse = {
  trades: [{
    side: 'long', entryTime: 1, entryPrice: 100, exitTime: 2, exitPrice: 101, quantity: 10, pnl: 10, returnPct: 1,
    barsHeld: 1, exitReason: 'endOfData',
  }],
  equity: [{ time: 1, equity: 1000 }, { time: 2, equity: 1010 }],
  metrics, signals: { entries: 1, exits: 0 }, inSample: null, outOfSample: { startTime: 2, endTime: 2, metrics },
};
const request: BacktestRequest = {
  bars: [
    { time: 1, open: 100, high: 100, low: 100, close: 100, volume: null },
    { time: 2, open: 100, high: 101, low: 100, close: 101, volume: null },
  ],
  strategy: { entry: { kind: 'compare', left: { kind: 'series', name: 'close' }, op: 'gt', right: { kind: 'value', value: 0 } } },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function hanging(_url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')); });
  });
}

// SRD §10.2, §11: the generated contract, validated at the edge.
describe('createComputeClient', () => {
  it('posts the request as JSON with the request id and returns the parsed response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(json(response)));
    const client = createComputeClient({ baseUrl: 'http://compute:8100/', fetch });
    await expect(client.backtest(request, { requestId: 'req-1' })).resolves.toEqual(response);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('http://compute:8100/compute/v1/backtest');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('x-request-id')).toBe('req-1');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(typeof init?.body === 'string' ? JSON.parse(init.body) : undefined).toEqual(request);
  });

  it('rejects a response that does not match the contract', async () => {
    const client = createComputeClient({ baseUrl: 'http://compute', fetch: () => Promise.resolve(json({ ...response, trades: 'x' })) });
    await expect(client.backtest(request)).rejects.toBeInstanceOf(ComputeResponseError);
  });

  it('maps an error body to ComputeHttpError with its status and code', async () => {
    const body = { code: 'VALIDATION_FAILED', message: 'bad', requestId: 'r', details: [{ loc: ['body', 'bars'], msg: 'x', type: 'y' }] };
    const client = createComputeClient({ baseUrl: 'http://compute', fetch: () => Promise.resolve(json(body, 422)) });
    const error = await client.backtest(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ComputeHttpError);
    expect(error).toMatchObject({ status: 422, body: { code: 'VALIDATION_FAILED', message: 'bad' } });
  });

  it('keeps the status when an error body is not the error shape', async () => {
    const client = createComputeClient({ baseUrl: 'http://compute', fetch: () => Promise.resolve(new Response('gateway', { status: 502 })) });
    await expect(client.backtest(request)).rejects.toMatchObject({ status: 502, body: undefined });
  });

  it('times out with TimeoutError and aborts the request', async () => {
    const fetch = vi.fn(hanging);
    const client = createComputeClient({ baseUrl: 'http://compute', fetch });
    await expect(client.backtest(request, { timeoutMs: 5 })).rejects.toBeInstanceOf(TimeoutError);
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('stops when the caller aborts', async () => {
    const controller = new AbortController();
    const client = createComputeClient({ baseUrl: 'http://compute', fetch: hanging });
    const pending = client.backtest(request, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AbortedError);
  });

  it('reads health', async () => {
    const client = createComputeClient({ baseUrl: 'http://compute', fetch: () => Promise.resolve(json({ status: 'ok' })) });
    await expect(client.health()).resolves.toEqual({ status: 'ok' });
  });
});
