import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import type { Bar, BarsResponse } from '@aitrader/contracts';
import { IndicatorService, RuntimeResolver } from '../../application';
import { NativeRuntime } from '../native/native-runtime';
import type { CandleRequest, CandleSource } from '../../application/ports/candle-source';
import { PinePool, type PinePoolOptions } from './pine-pool';
import { PineRuntime } from './pine-runtime';

let worker: Promise<string> | undefined;

/** The worker bundled to plain JS (production runs the compiled file; specs run TypeScript), once per spec file. */
export function pineWorkerFile(): Promise<string> {
  worker ??= (async () => {
    // Inside the package so `pinets` resolves to the same patched build production loads.
    const dir = join(process.cwd(), 'node_modules', '.cache', 'pine-worker');
    await mkdir(dir, { recursive: true });
    const outfile = join(dir, `pine-worker-${String(process.pid)}.cjs`);
    await build({ entryPoints: [join(process.cwd(), 'src', 'modules', 'indicators', 'infrastructure', 'pine', 'pine-worker.ts')], outfile, bundle: true, external: ['pinets'], platform: 'node', format: 'cjs', logLevel: 'silent' });
    return outfile;
  })();
  return worker;
}

export async function testPool(options: Partial<PinePoolOptions> = {}): Promise<PinePool> {
  return new PinePool({ workerFile: await pineWorkerFile(), size: 2, heapMb: 256, timeoutMs: 5000, ...options });
}

/** Serves fixed bars per `EXCHANGE:TICKER` and interval; anything else has no data. */
export class FakeCandles implements CandleSource {
  readonly requests: CandleRequest[] = [];
  constructor(private readonly bars: Record<string, Bar[]> = {}) {}

  read(request: CandleRequest): ReturnType<CandleSource['read']> {
    this.requests.push(request);
    const bars = this.bars[`${request.symbol}|${request.interval}`] ?? [];
    return Promise.resolve(bars.length > 0 ? { bars } : { bars, reason: 'NO_DATA' });
  }
}

export async function testRuntime(candles: CandleSource = new FakeCandles(), options: Partial<PinePoolOptions> = {}): Promise<{ runtime: PineRuntime; pool: PinePool }> {
  const pool = await testPool(options);
  return { runtime: new PineRuntime(pool, candles), pool };
}

export interface PineHarness { service: IndicatorService; runtime: PineRuntime; pool: PinePool; candles: FakeCandles; history: Bar[] }

/** The real service over native and Pine runtimes, with fake market bars (every symbol resolves to `NSE:TEST`). */
export async function pineHarness(history: Bar[], other: Record<string, Bar[]> = {}, options: Partial<PinePoolOptions> = {}): Promise<PineHarness> {
  const candles = new FakeCandles(other);
  const { runtime, pool } = await testRuntime(candles, options);
  const market = { bars: (symbol: string, interval: BarsResponse['interval'], _cursor: unknown, limit: number): Promise<BarsResponse> =>
    Promise.resolve({ instrumentId: symbol, resolvedId: 'NSE:TEST', interval, bars: history.slice(-limit), nextBefore: null, status: { state: 'ok' } }) };
  const service = new IndicatorService(market, new RuntimeResolver([new NativeRuntime(), runtime]), () => 'Asia/Kolkata', runtime);
  return { service, runtime, pool, candles, history };
}
