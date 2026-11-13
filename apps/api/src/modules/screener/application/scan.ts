import { createHash } from 'node:crypto';
import { SCREEN_LIMITS, ScreenSpecSchema, type FundamentalField, type FundamentalFilter, type ScanResult, type ScanRow, type ScreenPreset, type ScreenSpec } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import { conditionSeriesNames, evaluateCondition, valueAt } from '../domain/condition-eval';
import { BAR_FIELDS, DERIVED_SERIES, derivedSeries, type Bar, type Series } from '../domain/derived-series';
import { presetById, PRESETS, type PresetDef } from '../domain/presets';
import type { FundamentalsPort, IndicatorPort, ResultCache, StoredBarsPort, UniversePort } from './ports';

export interface ScanDeps { universes: UniversePort; bars: StoredBarsPort; indicators: IndicatorPort; fundamentals: FundamentalsPort; cache: ResultCache; cacheTtlSeconds?: number }

const SPARK_POINTS = 30;
const CUSTOM_BARS = 300;
const FUNDAMENTALS_MISSING = 'no fundamentals cached';

/** What a scan runs: the preset's definition, or the spec's own indicators and condition. */
type Plan = Pick<PresetDef, 'indicators' | 'condition' | 'sort' | 'bars' | 'minBars' | 'values'>;

const compareFundamental = (f: FundamentalFilter, actual: number): boolean => f.op === 'gt' ? actual > f.value : f.op === 'gte' ? actual >= f.value : f.op === 'lt' ? actual < f.value : actual <= f.value;

export const listPresets = (): ScreenPreset[] => PRESETS.map(({ id, name, description }) => ({ id, name, description }));
export const listSeries = (): Array<{ name: string; description: string }> => [
  ...BAR_FIELDS.map(name => ({ name, description: `Bar ${name}` })), ...Object.entries(DERIVED_SERIES).map(([name, { description }]) => ({ name, description })),
];

function planOf(spec: ScreenSpec): Plan {
  if (spec.preset !== undefined) {
    if (spec.condition !== undefined) throw new ValidationError('Give a preset or conditions, not both');
    const preset = presetById(spec.preset);
    if (!preset) throw new ValidationError(`Unknown preset "${spec.preset}"`, { presets: PRESETS.map(p => p.id) });
    if (preset.intervals && !preset.intervals.includes(spec.interval)) throw new ValidationError(`Preset ${preset.id} runs on ${preset.intervals.join(', ')} only`);
    return preset;
  }
  const referenced = spec.condition ? conditionSeriesNames(spec.condition) : new Set<string>();
  const declared = new Set(spec.indicators.map(i => i.name));
  if (declared.size !== spec.indicators.length) throw new ValidationError('Indicator names must be unique');
  for (const name of declared) if ((BAR_FIELDS as readonly string[]).includes(name) || name in DERIVED_SERIES) throw new ValidationError(`Indicator name "${name}" is a built-in series name`);
  for (const name of referenced) {
    if (!declared.has(name) && !(BAR_FIELDS as readonly string[]).includes(name) && !(name in DERIVED_SERIES)) throw new ValidationError(`Unknown series "${name}"`, { declared: [...declared] });
  }
  const shown = [...declared, ...[...referenced].filter(n => n in DERIVED_SERIES)];
  return { indicators: spec.indicators, ...(spec.condition ? { condition: spec.condition } : {}), sort: { by: 'changePct', order: 'desc' }, bars: CUSTOM_BARS, minBars: 2, values: shown };
}

/** An indicator's plot aligned to the bars by time. */
function alignPlot(bars: Bar[], times: number[], values: Array<number | null>): Series {
  const last = bars.length - 1;
  if (times.length === bars.length && times[last] === (bars[last] as Bar).time && times[0] === (bars[0] as Bar).time) return values;
  const byTime = new Map(times.map((t, i) => [t, values[i] ?? null]));
  return bars.map(b => byTime.get(b.time) ?? null);
}

/** Scans a universe's stored bars for the latest closed bar: one batched read per source, everything else in memory. */
export class ScanService {
  constructor(private readonly deps: ScanDeps) {}

  async scan(userId: string, input: ScreenSpec, opts?: { now?: () => number }): Promise<ScanResult> {
    const clock = opts?.now ?? Date.now;
    const started = clock();
    const spec = ScreenSpecSchema.parse(input);
    const plan = planOf(spec);
    const members = await this.deps.universes.members(spec.universe, userId);
    if (members.length > SCREEN_LIMITS.maxUniverse) throw new ValidationError(`Universe ${spec.universe} has ${String(members.length)} symbols; at most ${String(SCREEN_LIMITS.maxUniverse)} can be scanned`);
    const bars = await this.deps.bars.latest(members.map(m => m.symbol), spec.interval, plan.bars);
    let asOfBar: number | null = null;
    for (const b of bars.values()) if (b.newestTime !== null && (asOfBar === null || b.newestTime > asOfBar)) asOfBar = b.newestTime;

    const key = `screener:${spec.universe}:${spec.universe === 'watchlist' ? userId : '-'}:${createHash('sha1').update(JSON.stringify(spec)).digest('hex').slice(0, 20)}:${String(asOfBar)}`;
    if (asOfBar !== null) {
      // A cache outage only costs a recompute.
      const hit = await this.deps.cache.get(key).catch(() => null);
      if (hit) return { ...hit, cached: true, durationMs: Math.max(0, Math.round(clock() - started)) };
    }
    const fundamentals = spec.fundamentals.length > 0 ? await this.deps.fundamentals.getMany(members.map(m => m.symbol)) : new Map<string, Partial<Record<FundamentalField, number | null>>>();

    const stale: ScanResult['stale'] = [];
    const matches: Array<{ row: ScanRow; sortKey: number | null }> = [];
    const names = new Set([...plan.values, plan.sort.by, 'changePct', ...(plan.condition ? conditionSeriesNames(plan.condition) : [])]);
    for (const { symbol, name } of members) {
      const stored = bars.get(symbol);
      if (!stored || stored.bars.length === 0) { stale.push({ symbol, reason: stored?.stale ?? 'no stored bars' }); continue; }
      if (stored.stale !== null) { stale.push({ symbol, reason: stored.stale }); continue; }
      if (stored.bars.length < plan.minBars) { stale.push({ symbol, reason: `only ${String(stored.bars.length)} bars stored; ${String(plan.minBars)} needed` }); continue; }
      const funds = fundamentals.get(symbol);
      const fundValues: Record<string, number | null> = {};
      if (spec.fundamentals.length > 0) {
        const actual = spec.fundamentals.map(f => funds?.[f.field]);
        const known = actual.filter((a): a is number => typeof a === 'number');
        if (known.length !== actual.length) { stale.push({ symbol, reason: FUNDAMENTALS_MISSING }); continue; }
        if (!spec.fundamentals.every((f, i) => compareFundamental(f, known[i] ?? NaN))) continue;
        spec.fundamentals.forEach((f, i) => { fundValues[f.field] = known[i] ?? null; });
      }
      const series: Record<string, Series> = derivedSeries(stored.bars, names);
      try {
        for (const ind of plan.indicators) {
          const out = await this.deps.indicators.computeOnBars({ id: ind.indicatorId, inputs: ind.inputs }, stored.bars);
          const plot = ind.plot === undefined ? out.plots[0] : out.plots.find(p => p.id === ind.plot);
          if (!plot) throw new Error(`indicator ${ind.indicatorId} has no plot ${ind.plot ?? '0'}`);
          series[ind.name] = alignPlot(stored.bars, out.times, plot.values);
        }
      } catch (error) { stale.push({ symbol, reason: `indicator failed: ${error instanceof Error ? error.message : 'unknown'}` }); continue; }
      const at = stored.bars.length - 1;
      const changePct = valueAt(series, 'changePct', at);
      if (plan.condition ? !evaluateCondition(plan.condition, series, at) : (spec.preset !== undefined && changePct === null)) continue;
      const last = stored.bars[at] as Bar;
      const values: Record<string, number | null> = { ...fundValues };
      for (const n of plan.values) values[n] = valueAt(series, n, at);
      matches.push({ sortKey: valueAt(series, plan.sort.by, at), row: { symbol, name, last: last.close, changePct, barTime: last.time, values,
        spark: stored.bars.slice(-SPARK_POINTS).map(b => b.close) } });
    }
    const dir = plan.sort.order === 'asc' ? 1 : -1;
    matches.sort((a, b) => (a.sortKey === null ? 1 : b.sortKey === null ? -1 : (a.sortKey - b.sortKey) * dir) || a.row.symbol.localeCompare(b.row.symbol));
    const result: ScanResult = { universe: spec.universe, interval: spec.interval, preset: spec.preset ?? null, asOfBar, scanned: members.length, matched: matches.length,
      rows: matches.slice(0, spec.limit).map(m => m.row), stale, durationMs: Math.max(0, Math.round(clock() - started)), cached: false };
    if (asOfBar !== null) await this.deps.cache.set(key, result, this.deps.cacheTtlSeconds ?? 60).catch(() => undefined);
    return result;
  }
}
