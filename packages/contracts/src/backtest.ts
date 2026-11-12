import { z } from 'zod';
import { IndicatorInputValuesSchema } from './indicator.js';
import { INTERVALS } from './market-data.js';

const NAME = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/);
const SymbolId = z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/);

/** A named series (an indicator output or a bar field) with an optional look-back, or a constant. */
export const BacktestOperandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('series'), name: NAME, offset: z.number().int().min(0).max(500).optional() }),
  z.strictObject({ kind: z.literal('value'), value: z.number() }),
]);
export type BacktestOperand = z.infer<typeof BacktestOperandSchema>;
export const COMPARE_OPS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'crossesAbove', 'crossesBelow'] as const;
export type BacktestCondition = { kind: 'compare'; left: BacktestOperand; op: (typeof COMPARE_OPS)[number]; right: BacktestOperand }
  | { kind: 'all' | 'any'; of: BacktestCondition[] } | { kind: 'not'; of: BacktestCondition };
export const BacktestConditionSchema: z.ZodType<BacktestCondition> = z.lazy(() => z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('compare'), left: BacktestOperandSchema, op: z.enum(COMPARE_OPS), right: BacktestOperandSchema }),
  z.strictObject({ kind: z.literal('all'), of: z.array(BacktestConditionSchema).min(1).max(20) }),
  z.strictObject({ kind: z.literal('any'), of: z.array(BacktestConditionSchema).min(1).max(20) }),
  z.strictObject({ kind: z.literal('not'), of: BacktestConditionSchema }),
]));
/** A stop or target distance: a percent of the entry price, or a multiple of a series (for example ATR) at the decision bar. */
export const BacktestLevelSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('percent'), percent: z.number().positive().max(1000) }),
  z.strictObject({ kind: z.literal('series'), name: NAME, multiple: z.number().positive().max(100) }),
]);
export type BacktestLevel = z.infer<typeof BacktestLevelSchema>;
export const BacktestRulesSchema = z.strictObject({ side: z.enum(['long', 'short']).default('long'), entry: BacktestConditionSchema, exit: BacktestConditionSchema.optional(),
  stopLoss: BacktestLevelSchema.optional(), takeProfit: BacktestLevelSchema.optional() });
export type BacktestRules = z.infer<typeof BacktestRulesSchema>;

export const BacktestIndicatorSchema = z.strictObject({ name: NAME, indicatorId: z.string().regex(/^[a-z][a-z0-9]{0,39}$/), inputs: IndicatorInputValuesSchema.default({}), plot: z.string().max(40).optional() });
export const BacktestCostsSchema = z.strictObject({ commissionPct: z.number().min(0).max(5), slippagePct: z.number().min(0).max(5) });
export const DEFAULT_COSTS = { commissionPct: 0.03, slippagePct: 0.02 } as const;

/** Everything a backtest depends on: changing any of it makes a new variant (FR-BT-2). */
export const BacktestSpecSchema = z.strictObject({
  symbol: SymbolId, interval: z.enum(INTERVALS), bars: z.number().int().min(100).max(5000).default(2000),
  indicators: z.array(BacktestIndicatorSchema).max(6).default([]), strategy: BacktestRulesSchema, costs: BacktestCostsSchema.default({ ...DEFAULT_COSTS }),
});
export type BacktestSpec = z.infer<typeof BacktestSpecSchema>;

const Metrics = z.strictObject({
  totalReturnPct: z.number(), maxDrawdownPct: z.number(), tradeCount: z.number().int(), profitFactor: z.number().nullable(), sharpe: z.number().nullable(),
  exposurePct: z.number().nullable(), cagrPct: z.number().nullable(), winRatePct: z.number().nullable(),
});
const Segment = z.strictObject({ startTime: z.number(), endTime: z.number(), metrics: Metrics }).nullable();
export const BacktestResultSchema = z.strictObject({
  sample: z.strictObject({ symbol: SymbolId, interval: z.enum(INTERVALS), bars: z.number().int(), from: z.string(), to: z.string() }),
  costs: BacktestCostsSchema,
  metrics: Metrics, inSample: Segment, outOfSample: Segment,
  signals: z.strictObject({ entries: z.number().int(), exits: z.number().int() }),
  /** At most the last 300 trades and 500 equity points (thinned evenly). */
  trades: z.array(z.strictObject({ entryTime: z.number(), entryPrice: z.number(), exitTime: z.number(), exitPrice: z.number(), pnl: z.number(), returnPct: z.number(),
    barsHeld: z.number().int(), exitReason: z.string(), side: z.string() })),
  equity: z.array(z.strictObject({ time: z.number(), equity: z.number() })),
});
export type BacktestResult = z.infer<typeof BacktestResultSchema>;

export const STRATEGY_LIMITS = { perUser: 50, nameChars: 80 } as const;
export const StrategyNameSchema = z.string().trim().min(1).max(STRATEGY_LIMITS.nameChars);
export const StrategySchema = z.strictObject({ id: z.uuid(), name: StrategyNameSchema, spec: BacktestSpecSchema, variants: z.number().int().nonnegative(), createdAt: z.string(), updatedAt: z.string() });
export type StrategyDto = z.infer<typeof StrategySchema>;
export const StrategyListResponseSchema = z.strictObject({ items: z.array(StrategySchema) });
export const StrategyCreateSchema = z.strictObject({ name: StrategyNameSchema, spec: BacktestSpecSchema });
export const StrategyUpdateSchema = z.strictObject({ name: StrategyNameSchema.optional(), spec: BacktestSpecSchema.optional() });
/** Run a spec; with a `strategyId` the run counts as a variant of that strategy when its parameters are new. */
export const BacktestRunRequestSchema = z.strictObject({ strategyId: z.uuid().optional(), spec: BacktestSpecSchema });
export const BacktestRunResponseSchema = z.strictObject({ result: BacktestResultSchema, variants: z.number().int().nonnegative().nullable() });
export type BacktestRunResponse = z.infer<typeof BacktestRunResponseSchema>;
