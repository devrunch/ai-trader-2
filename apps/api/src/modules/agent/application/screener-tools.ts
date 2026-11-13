import { z } from 'zod';
import { FundamentalFilterSchema, BacktestConditionSchema, BacktestIndicatorSchema, IndicatorInputValuesSchema, SCREEN_INTERVALS, SCREEN_LIMITS, UNIVERSES,
  type DeskTask, type ScanResult, type ScreenPreset, type ScreenSpec, type TaskTrigger } from '@aitrader/contracts';
import { ValidationError } from '../../../shared/errors';
import { describeWatch } from '../domain/watch';
import { guardedTool, orJsonString, type GuardDeps, type GuardedTool } from './guarded-tool';

const MAX_TOOL_ROWS = 30;
const MAX_STALE_LISTED = 10;
/** The desk needs a symbol at creation; each fire replaces it with the first new match. */
const DESK_PLACEHOLDER = 'NSE:NIFTY';

export interface ScreenerTaskDesk {
  create(userId: string, threadId: string, input: { title: string; instruction: string; trigger: TaskTrigger; maxRuns?: number | undefined; expiresInDays?: number | undefined; desk?: DeskTask | null | undefined }): Promise<unknown>;
}

const Indicators = z.array(z.strictObject({ ...BacktestIndicatorSchema.shape, inputs: orJsonString(IndicatorInputValuesSchema).default({}) })).max(6).default([]);
const SpecFields = {
  universe: z.enum(UNIVERSES), interval: z.enum(SCREEN_INTERVALS).default('1D'), preset: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  indicators: orJsonString(Indicators).default([]), condition: orJsonString(BacktestConditionSchema).optional(),
  fundamentals: orJsonString(z.array(FundamentalFilterSchema).max(8)).default([]),
};
const specOf = (input: { universe: ScreenSpec['universe']; interval: ScreenSpec['interval']; preset?: string | undefined; indicators: ScreenSpec['indicators']; condition?: ScreenSpec['condition'] | undefined;
  fundamentals: ScreenSpec['fundamentals'] }, limit: number): ScreenSpec => ({ universe: input.universe, interval: input.interval, indicators: input.indicators, fundamentals: input.fundamentals, limit,
  ...(input.preset === undefined ? {} : { preset: input.preset }), ...(input.condition === undefined ? {} : { condition: input.condition }) });

/** Checked here so a bad spec is refused at creation instead of failing silently on every tick. */
function validated(spec: ScreenSpec): ScreenSpec {
  if (spec.preset === undefined && spec.condition === undefined && spec.fundamentals.length === 0) throw new ValidationError('Give a preset, conditions or fundamental filters');
  return spec;
}

/** Screens a universe on stored bars (server-computed indicators), and watches a screen for new matches. */
export function buildScreenerTools(scan: { scan(userId: string, spec: ScreenSpec): Promise<ScanResult> }, presets: ScreenPreset[], tasks: ScreenerTaskDesk, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  const presetList = presets.map(p => `${p.id} (${p.description})`).join('; ');
  const seriesHelp = 'Custom conditions use the backtest condition format over bar fields open/high/low/close/volume, derived series (prevClose, changePct, gapPct, range, lowestRange7, highestHigh20, lowestLow20, highestHigh252, lowestLow252, avgVolume20, volumeRatio) and your own indicators ({name, indicatorId, inputs}).';
  return [
    guardedTool({ name: 'scanUniverse',
      description: `Screen a universe (${UNIVERSES.join(', ')}) on the latest closed bar of STORED data and return the top matches with the values that decided them. Presets: ${presetList}. ${seriesHelp} `
        + 'Optional fundamentals filters (Indian equities: marketCap, pe, roe, roce, ...). Symbols without fresh data are counted as stale, never dropped silently; say so when stale is high. A screen gives candidates, not conclusions.',
      input: z.strictObject({ ...SpecFields, limit: z.number().int().min(1).max(MAX_TOOL_ROWS).default(15) }),
      run: async (input, ctx) => {
        const result = await scan.scan(ctx.userId, validated(specOf(input, input.limit)));
        return { universe: result.universe, interval: result.interval, preset: result.preset, asOfBar: result.asOfBar === null ? null : new Date(result.asOfBar).toISOString(), source: 'stored bars',
          scanned: result.scanned, matched: result.matched, stale: result.stale.length, staleSample: result.stale.slice(0, MAX_STALE_LISTED), cached: result.cached,
          rows: result.rows.map(({ symbol, name, last, changePct, values }) => ({ symbol, name, last, changePct, values })) };
      } }, deps),
    guardedTool({ name: 'watchScreen',
      description: 'Watch a screen in the background: once per new closed bar it is run, and you wake up when symbols newly match (each symbol at most once a day). Same spec as scanUniverse, plus the instruction. '
        + 'You reply REPORT: or SILENT: on each wake-up. Set desk to run the multi-analyst trading desk on the first new match instead of a single turn.',
      input: z.strictObject({ ...SpecFields, limit: z.number().int().min(1).max(SCREEN_LIMITS.maxResults).default(50),
        instruction: z.string().min(1).max(2000).default('Assess these new matches: which look worth the user\'s attention and why?'),
        maxRuns: z.number().int().min(1).max(100).default(10), expiresInDays: z.number().int().min(1).max(30).default(7),
        desk: z.strictObject({ rounds: z.number().int().min(1).max(2).default(1) }).optional() }),
      run: ({ instruction, maxRuns, expiresInDays, desk, limit, ...rest }, ctx) => {
        const trigger = { kind: 'screen' as const, spec: validated(specOf(rest, limit)) };
        return tasks.create(ctx.userId, ctx.conversationId, { title: describeWatch(trigger), instruction, trigger, maxRuns, expiresInDays,
          desk: desk ? { symbol: DESK_PLACEHOLDER, rounds: desk.rounds } : null });
      } }, deps),
  ];
}
