import type { IndicatorChartInputs, IndicatorComputeRequest, IndicatorDefinition, IndicatorResult, IndicatorSpec, Interval } from '@aitrader/contracts';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import type { MarketDataService } from '../../market-data/application/index';
import { BUILTINS, findBuiltin, findBuiltinByRef } from '../domain/catalog';
import { InvalidIndicatorInputError, UnknownIndicatorError } from '../domain/errors';
import { resolveInputs } from '../domain/inputs';
import { shiftByOffset } from '../domain/offset';
import { IndicatorStream } from './indicator-stream';
import type { IndicatorInstance, IndicatorProgram, PlotValues, RuntimeContext } from './ports/indicator-runtime';
import type { RuntimeResolver } from './runtime-resolver';
import { SourcedInstance } from './sourced-instance';
import { resolveChain, type ChainNode } from './source-chain';

const MAX_BARS = 5000;
const PINE_WARMUP = 500;

interface Plan { program: IndicatorProgram; ref: string; /** Bars the program needs before its first value is right. */ warmup: number; offsets: Readonly<Record<string, number>>; plots: string[] | null;
  /** The inputs as resolved, with a source ref kept as the ref rather than the runtime marker. */
  inputs: IndicatorResult['inputs'] }

/** FR-IN-31: the one entry point for indicator values; REST, sockets, agent tools, alerts and backtests all call it. */
export class IndicatorService {
  constructor(private readonly market: Pick<MarketDataService, 'bars'>, private readonly runtimes: RuntimeResolver,
    private readonly timezoneOf: (instrumentId: string) => string) {}

  list(): IndicatorDefinition[] { return BUILTINS.map(b => b.definition); }

  /** Throws when the built-in is unknown or an input is out of bounds; nothing is computed. */
  checkInputs(id: string, inputs: IndicatorChartInputs): void { domain(() => { resolveInputs(findBuiltin(id).definition.inputs, inputs); }); }

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
    const chain = resolveChain(request);
    const { ref, offsets, plots, inputs } = plan(chain.spec, request.interval, chain);
    const warmup = chainWarmup(chain, request.interval);
    const { limit, before } = request.range;
    const page = await this.market.bars(request.symbol, request.interval, before === undefined ? { latest: true } : { before },
      Math.min(MAX_BARS, limit + warmup + Math.max(0, ...Object.values(offsets))));
    const instance = this.instantiate(chain, { instrumentId: page.resolvedId, interval: request.interval, timezone: this.timezoneOf(page.resolvedId) });
    let rows: PlotValues[];
    try { rows = await instance.seed(page.bars); } catch (error) { instance.close(); throw error; }
    const ids = plots ?? Object.keys(rows[0] ?? {});
    const times = page.bars.map(b => b.time);
    const from = Math.max(0, times.length - limit);
    const result: IndicatorResult = {
      instrumentId: page.instrumentId, resolvedId: page.resolvedId, interval: request.interval, ref, inputs,
      times: times.slice(from), status: page.status,
      plots: ids.map(id => ({ id, values: shiftByOffset(rows.map(row => row[id] ?? null), offsets[id] ?? 0).slice(from) })),
    };
    return { result, stream: new IndicatorStream(instance, ids, offsets, { times, rows }, times.at(-1)) };
  }

  /** The chain's instances, each parent feeding its child; closing the top one closes them all. */
  private instantiate(node: ChainNode, context: RuntimeContext): IndicatorInstance {
    const { program } = plan(node.spec, context.interval, node);
    const child = this.runtimes.resolve(program).create(program, context);
    if (!node.parent) return child;
    try { return new SourcedInstance(child, this.instantiate(node.parent.node, context), node.parent.ref.plot); } catch (error) { child.close(); throw error; }
  }
}

/** A chain needs the parent converged before the child starts, so the warm-ups add up. */
function chainWarmup(node: ChainNode, interval: Interval): number {
  return plan(node.spec, interval, node).warmup + (node.parent ? chainWarmup(node.parent.node, interval) : 0);
}

function plan(spec: IndicatorSpec, interval: Interval, node: ChainNode): Plan {
  if (spec.kind === 'pine') return { program: { kind: 'pine', source: spec.source, inputs: spec.inputs }, ref: 'pine', warmup: PINE_WARMUP, offsets: {}, plots: null, inputs: spec.inputs };
  const builtin = domain(() => findBuiltin(spec.id, spec.version));
  const inputs = domain(() => resolveInputs(builtin.definition.inputs, spec.inputs));
  const shared = typeof inputs.offset === 'number' ? inputs.offset : 0;
  const own = builtin.plotOffsets?.(inputs) ?? {};
  const plots = builtin.definition.plots.map(p => p.id);
  return { program: { kind: 'builtin', builtin, inputs }, ref: builtin.definition.ref, warmup: builtin.warmup(inputs, interval),
    offsets: Object.fromEntries(plots.map(id => [id, shared + (own[id] ?? 0)])), plots,
    inputs: node.parent ? { ...inputs, [node.parent.inputId]: node.parent.ref } : inputs };
}

function domain<T>(run: () => T): T {
  try { return run(); } catch (error) {
    if (error instanceof UnknownIndicatorError) throw new NotFoundError(error.message, { ref: error.ref });
    if (error instanceof InvalidIndicatorInputError) throw new ValidationError(error.message, { input: error.input });
    throw error;
  }
}
