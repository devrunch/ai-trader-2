import { z } from 'zod';
import { INTERVALS } from './market-data.js';

const SymbolId = z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/);
export const DESK_ACTIONS = ['BUY', 'SELL', 'HOLD'] as const;
export const DESK_ROLES = ['news', 'technical', 'macro', 'fundamentals', 'bull', 'bear', 'trader', 'risk'] as const;
export const DESK_LIMITS = { maxRounds: 2, maxBacktestDates: 30 } as const;

const Confidence = z.number().min(0).max(1);
const Short = (max: number) => z.string().max(max);

/** One analyst's structured read of the data it was given. */
export const DeskReportSchema = z.strictObject({
  stance: z.enum(['bullish', 'bearish', 'neutral']), confidence: Confidence, summary: Short(700), evidence: z.array(Short(240)).max(6),
});
export type DeskReport = z.infer<typeof DeskReportSchema>;
/** A role that did not run, and why (for example there is no fundamentals data for the instrument). */
export const DeskSkippedSchema = z.strictObject({ skipped: Short(200) });

/** One side's argument in the debate; `rebuttal` answers the other side's last argument (empty in round 1 for the bull). */
export const DeskArgumentSchema = z.strictObject({ side: z.enum(['bull', 'bear']), round: z.number().int().min(1).max(DESK_LIMITS.maxRounds),
  argument: Short(900), keyPoints: z.array(Short(240)).max(5), rebuttal: Short(500) });
export type DeskArgument = z.infer<typeof DeskArgumentSchema>;

/** The trader's proposal. Prices are the model's reading of the supplied levels; the size is computed by code, never by the model. */
export const DeskProposalSchema = z.strictObject({
  action: z.enum(DESK_ACTIONS), confidence: Confidence, entry: z.number().positive().nullable(), stopLoss: z.number().positive().nullable(), target: z.number().positive().nullable(),
  skill: z.string().regex(/^[a-z0-9-]{1,57}$/).nullable(), rationale: Short(900),
});
export type DeskProposal = z.infer<typeof DeskProposalSchema>;

/** The risk manager's own call, on top of the code gate. */
export const DeskRiskReviewSchema = z.strictObject({ approve: z.boolean(), reasons: z.array(Short(300)).max(6) });
export type DeskRiskReview = z.infer<typeof DeskRiskReviewSchema>;

export const DeskDecisionSchema = z.strictObject({
  action: z.enum(DESK_ACTIONS), confidence: Confidence, entry: z.number().nullable(), stopLoss: z.number().nullable(), target: z.number().nullable(),
  quantity: z.number().int().nonnegative().nullable(), skill: z.string().nullable(), summary: Short(900), vetoed: z.boolean(), vetoReasons: z.array(Short(300)).max(12),
});
export type DeskDecision = z.infer<typeof DeskDecisionSchema>;

export const DeskTrailSchema = z.strictObject({
  data: z.strictObject({ asOf: z.string(), lastClose: z.number().nullable(), bars: z.number().int(), headlines: z.number().int(), events: z.number().int() }),
  reports: z.strictObject({ news: z.union([DeskReportSchema, DeskSkippedSchema]), technical: z.union([DeskReportSchema, DeskSkippedSchema]),
    macro: z.union([DeskReportSchema, DeskSkippedSchema]), fundamentals: DeskSkippedSchema }),
  debate: z.array(DeskArgumentSchema).max(2 * DESK_LIMITS.maxRounds),
  proposal: DeskProposalSchema.nullable(), riskReview: DeskRiskReviewSchema.nullable(),
  gate: z.strictObject({ pass: z.boolean(), blocks: z.array(Short(300)).max(12) }),
});
export type DeskTrail = z.infer<typeof DeskTrailSchema>;

export const DeskRunSchema = z.strictObject({
  id: z.uuid(), symbol: SymbolId, asOf: z.string(), live: z.boolean(), createdAt: z.string(), status: z.enum(['done', 'budget', 'error']),
  decision: DeskDecisionSchema, trail: DeskTrailSchema, tokens: z.number().int().nonnegative(), calls: z.number().int().nonnegative(), error: Short(300).nullable(),
});
export type DeskRunDto = z.infer<typeof DeskRunSchema>;
export const DeskRunListSchema = z.strictObject({ items: z.array(DeskRunSchema) });
/** `asOf` (ISO date or date-time, not in the future) replays the desk with only the data that existed then; absent means now. */
export const DeskRunRequestSchema = z.strictObject({ symbol: SymbolId, asOf: z.iso.datetime({ offset: true }).optional(), rounds: z.number().int().min(1).max(DESK_LIMITS.maxRounds).default(1) });

export const DeskBacktestRequestSchema = z.strictObject({
  symbol: SymbolId, dates: z.array(z.iso.date()).min(1).max(DESK_LIMITS.maxBacktestDates), rounds: z.number().int().min(1).max(DESK_LIMITS.maxRounds).default(1),
  interval: z.enum(INTERVALS).default('5'), horizonBars: z.number().int().min(5).max(500).default(75),
});
export type DeskBacktestRequest = z.infer<typeof DeskBacktestRequestSchema>;
export const DeskEstimateSchema = z.strictObject({ runs: z.number().int(), callsPerRun: z.number().int(), calls: z.number().int(), tokensEstimate: z.number().int(), dailyRunsLeft: z.number().int() });
export type DeskEstimate = z.infer<typeof DeskEstimateSchema>;

export const DESK_OUTCOMES = ['target', 'stop', 'timeout', 'no-trade', 'no-data'] as const;
export const DeskScoredSchema = z.strictObject({ asOf: z.string(), action: z.enum(DESK_ACTIONS), entry: z.number().nullable(), stopLoss: z.number().nullable(), target: z.number().nullable(),
  outcome: z.enum(DESK_OUTCOMES), r: z.number().nullable(), exitPrice: z.number().nullable(), runId: z.uuid().nullable() });
export type DeskScored = z.infer<typeof DeskScoredSchema>;
export const DeskScoreSummarySchema = z.strictObject({ trades: z.number().int(), holds: z.number().int(), hitRatePct: z.number().nullable(), avgR: z.number().nullable(),
  totalR: z.number(), maxDrawdownR: z.number() });
export type DeskScoreSummary = z.infer<typeof DeskScoreSummarySchema>;
export const DeskBacktestSchema = z.strictObject({
  id: z.uuid(), symbol: SymbolId, status: z.enum(['running', 'done', 'failed']), rounds: z.number().int(), progress: z.strictObject({ done: z.number().int(), total: z.number().int() }),
  items: z.array(DeskScoredSchema), summary: DeskScoreSummarySchema.nullable(), tokens: z.number().int(), createdAt: z.string(), finishedAt: z.string().nullable(), error: Short(300).nullable(),
});
export type DeskBacktestDto = z.infer<typeof DeskBacktestSchema>;
export const DeskBacktestListSchema = z.strictObject({ items: z.array(DeskBacktestSchema) });

/** A watch that runs the desk instead of a single assistant turn. */
export const DeskTaskSchema = z.strictObject({ symbol: SymbolId, rounds: z.number().int().min(1).max(DESK_LIMITS.maxRounds).default(1) });
export type DeskTask = z.infer<typeof DeskTaskSchema>;
