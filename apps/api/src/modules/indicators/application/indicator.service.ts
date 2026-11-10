import type { IndicatorComputeRequest, IndicatorDefinition, IndicatorResult } from '@aitrader/contracts';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import type { MarketDataService } from '../../market-data/application/index';
import { BUILTINS, findBuiltin, findBuiltinByRef } from '../domain/catalog';
import { InvalidIndicatorInputError, UnknownIndicatorError } from '../domain/errors';
import { resolveInputs } from '../domain/inputs';
import { shiftByOffset } from '../domain/offset';
import { IndicatorStream } from './indicator-stream';
import type { IndicatorProgram, PlotValues } from './ports/indicator-runtime';
import type { RuntimeResolver } from './runtime-resolver';

const MAX_BARS = 5000;
const PINE_WARMUP = 500;

interface Plan { program: IndicatorProgram; ref: string; warmup: number; offset: number; plots: string[] | null }

/** FR-IN-31: the one entry point for indicator values; REST, sockets, agent tools, alerts and backtests all call it. */
export class IndicatorService {
  constructor(private readonly market: Pick<MarketDataService, 'bars'>, private readonly runtimes: RuntimeResolver,
    private readonly timezoneOf: (instrumentId: string) => string) {}

  list(): IndicatorDefinition[] { return BUILTINS.map(b => b.definition); }

  get(ref: string): IndicatorDefinition { return domain(() => findBuiltinByRef(ref)).definition; }

  /** A built-in's Pine source, which users can read and fork. */
  source(ref: string): string { return domain(() => findBuiltinByRef(ref)).pine; }

  async compute(request: IndicatorComputeRequest): Promise<IndicatorResult> {
    const { result, stream } = await this.open(request);
    stream.close();
    return result;
  }

  /** Computes the range, then keeps the instance for live updates from saved state. The caller closes the stream. */
  async open(request: IndicatorComputeRequest): Promise<{ result: IndicatorResult; stream: IndicatorStream }> {
    const { program, ref, warmup, offset, plots } = plan(request);
    const runtime = this.runtimes.resolve(program);
    const { limit, before } = request.range;
    const page = await this.market.bars(request.symbol, request.interval, before === undefined ? { latest: true } : { before },
      Math.min(MAX_BARS, limit + warmup + Math.max(0, offset)));
    const instance = runtime.create(program, { instrumentId: page.resolvedId, interval: request.interval, timezone: this.timezoneOf(page.resolvedId) });
    let rows: PlotValues[];
    try { rows = await instance.seed(page.bars); } catch (error) { instance.close(); throw error; }
    const ids = plots ?? Object.keys(rows[0] ?? {});
    const times = page.bars.map(b => b.time);
    const from = Math.max(0, times.length - limit);
    const result: IndicatorResult = {
      instrumentId: page.instrumentId, resolvedId: page.resolvedId, interval: request.interval, ref, inputs: { ...program.inputs },
      times: times.slice(from), status: page.status,
      plots: ids.map(id => ({ id, values: shiftByOffset(rows.map(row => row[id] ?? null), offset).slice(from) })),
    };
    return { result, stream: new IndicatorStream(instance, ids, offset, { times, rows }, times.at(-1)) };
  }
}

function plan(request: IndicatorComputeRequest): Plan {
  const spec = request.indicator;
  if (spec.kind === 'pine') return { program: { kind: 'pine', source: spec.source, inputs: spec.inputs }, ref: 'pine', warmup: PINE_WARMUP, offset: 0, plots: null };
  const builtin = domain(() => findBuiltin(spec.id, spec.version));
  const inputs = domain(() => resolveInputs(builtin.definition.inputs, spec.inputs));
  return { program: { kind: 'builtin', builtin, inputs }, ref: builtin.definition.ref, warmup: builtin.warmup(inputs, request.interval),
    offset: typeof inputs.offset === 'number' ? inputs.offset : 0, plots: builtin.definition.plots.map(p => p.id) };
}

function domain<T>(run: () => T): T {
  try { return run(); } catch (error) {
    if (error instanceof UnknownIndicatorError) throw new NotFoundError(error.message, { ref: error.ref });
    if (error instanceof InvalidIndicatorInputError) throw new ValidationError(error.message, { input: error.input });
    throw error;
  }
}
