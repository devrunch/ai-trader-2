import type { Bar } from '@aitrader/contracts';
import { PineWorkerError } from '../../domain/pine/pine-errors';
import { fromPineTimeframe, sessionFor, toCandles, toPineTimeframe } from '../../domain/pine/pine-timeframes';
import type { CandleSource } from '../../application/ports/candle-source';
import type { IndicatorInstance, PlotValues, RuntimeContext } from '../../application/ports/indicator-runtime';
import { failure } from './pine-failure';
import type { PineWorker } from './pine-pool';
import type { PlotRow } from './pine-protocol';

let nextInstance = 1;

/**
 * One Pine script on one worker: `seed` opens a PineTS stream over the history, `update` feeds ticks to it (FR-IN-6).
 * Callers serialise ticks (`IndicatorStream` does, and lets the newest win, FR-IN-30).
 */
export class PineInstance implements IndicatorInstance {
  readonly latestWins = true;
  reason: string | undefined;
  private readonly id = nextInstance++;
  private worker: PineWorker | null = null;
  private opened = false;
  private closed = false;

  constructor(private readonly acquire: () => PineWorker, private readonly candles: CandleSource, private readonly source: string,
    private readonly inputs: Readonly<Record<string, number | boolean | string>>, private readonly context: RuntimeContext) {}

  async seed(bars: readonly Bar[]): Promise<PlotValues[]> {
    if (bars.length === 0) return [];
    return this.open(bars);
  }

  async update(bar: Bar, replace: boolean): Promise<PlotValues> {
    try { return await this.compute(bar, replace); } catch (error) { throw failure(error, this.source); }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const worker = this.worker;
    if (worker) {
      worker.post({ type: 'close', instance: this.id });
      worker.onFetch(this.id, null);
      worker.instances--;
    }
  }

  private async open(bars: readonly Bar[]): Promise<PlotValues[]> {
    const worker = this.acquire();
    this.worker = worker;
    worker.instances++;
    worker.onFetch(this.id, request => this.fetch(request));
    const { interval, instrumentId, timezone } = this.context;
    try {
      const reply = await worker.request({ type: 'open', instance: this.id, source: this.source, inputs: this.inputs, symbol: instrumentId,
        timeframe: toPineTimeframe(interval), timezone, session: sessionFor(instrumentId), candles: toCandles(bars, interval) });
      if (reply.type !== 'rows') throw new Error('Unexpected reply from the Pine worker');
      this.opened = true;
      this.reason = reply.reason;
      return reply.rows;
    } catch (error) {
      this.close();
      throw failure(error, this.source);
    }
  }

  private async compute(bar: Bar, replace: boolean): Promise<PlotRow> {
    if (!this.opened) {
      const rows = await this.open([bar]);
      return rows[0] ?? {};
    }
    const worker = this.worker;
    if (!worker?.alive) throw worker ? new PineWorkerError('PINE_CRASHED', 'The Pine worker restarted; open the indicator again') : new Error('Indicator is not open');
    const [candle] = toCandles([bar], this.context.interval);
    if (!candle) throw new Error('Bad bar');
    const reply = await worker.request({ type: 'tick', instance: this.id, candle, replace });
    if (reply.type !== 'rows') throw new Error('Unexpected reply from the Pine worker');
    this.reason = reply.reason;
    return reply.rows[0] ?? {};
  }

  private async fetch({ symbol, timeframe, from, to }: { symbol: string; timeframe: string; from?: number | undefined; to?: number | undefined }): Promise<{ candles: ReturnType<typeof toCandles>; reason?: string }> {
    const interval = fromPineTimeframe(timeframe);
    if (!interval) return { candles: [], reason: `timeframe ${timeframe} is not available` };
    const { bars, reason } = await this.candles.read({ symbol, interval, from, to });
    return { candles: toCandles(bars, interval), ...(reason === undefined ? {} : { reason }) };
  }
}
