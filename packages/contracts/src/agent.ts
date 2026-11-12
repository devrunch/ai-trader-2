import { z } from 'zod';
import { IndicatorDefinitionSchema, IndicatorInputValuesSchema } from './indicator.js';
import { NEWS_IMPACTS } from './news.js';
import { DeskTaskSchema } from './desk.js';
import { PAPER_PRODUCTS } from './paper.js';
import { PINE_SCRIPT_LIMITS } from './pine-script.js';
import { DataStatusSchema, INTERVALS } from './market-data.js';

export const PROMPT_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const PromptVersionSchema = z.strictObject({
  key: z.string().regex(PROMPT_KEY), version: z.number().int().nonnegative(), content: z.string(),
  parentVersion: z.number().int().nonnegative().nullable(), message: z.string(), author: z.string(), createdAt: z.string(),
});
export type PromptVersionDto = z.infer<typeof PromptVersionSchema>;
export const PromptSummarySchema = z.strictObject({ key: z.string(), version: z.number().int().nonnegative(), source: z.enum(['file', 'admin']) });
export const PromptDetailSchema = z.strictObject({ active: PromptSummarySchema.extend({ content: z.string() }), history: z.array(PromptVersionSchema) });
export const PromptDiffSchema = z.array(z.strictObject({ op: z.enum([' ', '-', '+']), line: z.string() }));
export const PromptSaveRequestSchema = z.strictObject({ content: z.string().min(1).max(100_000), message: z.string().min(1).max(500) });
export const PromptRevertRequestSchema = z.strictObject({ version: z.number().int().nonnegative() });

export const AgentStatusSchema = z.strictObject({ enabled: z.boolean(), model: z.string().nullable() });
/** One UI message as the AI SDK sends it; parts stay loose because tool and data parts vary. */
export const ChatMessageSchema = z.looseObject({ id: z.string().min(1).max(100), role: z.enum(['user', 'assistant', 'system']), parts: z.array(z.looseObject({ type: z.string() })).max(200) });
/** Only the new user message travels; the server holds the history, so a client cannot forge earlier assistant or tool turns. */
export const ChatRequestSchema = z.strictObject({ id: z.uuid(), message: ChatMessageSchema.extend({ role: z.literal('user') }) });
export const ThreadSummarySchema = z.strictObject({ id: z.uuid(), title: z.string(), updatedAt: z.string() });
export const ThreadRenameRequestSchema = z.strictObject({ title: z.string().trim().min(1).max(120) });

/** Changes the assistant may propose to the user's workspace (FR-AG-17). Each one waits for the user; none touches orders. */
const SymbolId = z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/);
/** What the assistant wants drawn; the server computes the geometry from real bars (FR-AG-6). */
export const DrawingIntentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('levels'), symbol: SymbolId, interval: z.enum(INTERVALS), bars: z.number().int().min(50).max(1000).default(300), count: z.number().int().min(1).max(6).default(3) }),
  z.strictObject({ kind: z.literal('trendline'), symbol: SymbolId, interval: z.enum(INTERVALS), bars: z.number().int().min(50).max(1000).default(300), side: z.enum(['support', 'resistance']) }),
  z.strictObject({ kind: z.literal('range'), symbol: SymbolId, interval: z.enum(INTERVALS), from: z.number().int().nonnegative(), to: z.number().int().nonnegative() })
    .refine(r => r.from < r.to, { message: 'from must be before to', path: ['to'] }),
]);
export type DrawingIntent = z.infer<typeof DrawingIntentSchema>;
const Point = z.strictObject({ time: z.number().int(), price: z.number() });
export const DrawingSchema = z.strictObject({
  symbol: z.string(), interval: z.enum(INTERVALS),
  segments: z.array(z.strictObject({ from: Point, to: Point, label: z.string() })).max(10),
  note: z.string().nullable(), barsUsed: z.number().int().nonnegative(), lastBarTime: z.number().int().nullable(), status: DataStatusSchema,
});
export type Drawing = z.infer<typeof DrawingSchema>;

const AddIndicator = z.strictObject({ kind: z.literal('add-indicator'), indicatorId: z.string().regex(/^[a-z][a-z0-9]{0,39}$/), inputs: IndicatorInputValuesSchema.default({}) });
const OpenSymbol = z.strictObject({ kind: z.literal('open-symbol'), symbol: SymbolId, interval: z.enum(INTERVALS).optional() });
/** Pine the user shared: the runtime's description of it (or the error line) and, once applied, the My scripts entry it was saved as. */
const PineCheck = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), definition: IndicatorDefinitionSchema }),
  z.strictObject({ ok: z.literal(false), error: z.string(), line: z.number().int().positive().optional() }),
]);
export type PineCheck = z.infer<typeof PineCheck>;
const AddPine = z.strictObject({ kind: z.literal('add-pine'), name: z.string().trim().min(1).max(PINE_SCRIPT_LIMITS.nameChars),
  source: z.string().min(1).max(PINE_SCRIPT_LIMITS.sourceChars), check: PineCheck, scriptId: z.uuid().nullable() });
/** A paper order the assistant proposes for the user to confirm; applying it runs the risk check again and places it. `clientOrderId` is set once placed. */
const PlaceOrderAction = z.strictObject({ kind: z.literal('place-order'), symbol: SymbolId, side: z.enum(['buy', 'sell']), type: z.enum(['market', 'limit']), product: z.enum(PAPER_PRODUCTS),
  quantity: z.number().int().positive().max(1_000_000), limitPrice: z.number().positive().optional(), stopLoss: z.number().positive(), target: z.number().positive().optional(),
  rationale: z.string().max(500), clientOrderId: z.string().max(64).nullable() });
/** What the model may propose directly; drawings go through their intent so the server computes the geometry. */
export const ChartActionSchema = z.discriminatedUnion('kind', [AddIndicator, OpenSymbol]);
export const AgentActionSchema = z.discriminatedUnion('kind', [AddIndicator, OpenSymbol, AddPine, PlaceOrderAction, z.strictObject({ kind: z.literal('draw'), intent: DrawingIntentSchema })]);
export type AgentAction = z.infer<typeof AgentActionSchema>;
export const ACTION_CARD_STATES = ['pending', 'applied', 'dismissed', 'expired', 'failed'] as const;
export const ActionCardSchema = z.strictObject({
  id: z.uuid(), action: AgentActionSchema, state: z.enum(ACTION_CARD_STATES), reason: z.string().nullable(), expiresAt: z.string(),
  /** Server-computed geometry for a `draw` card: a preview when proposed, recomputed from fresh bars on apply. */
  drawing: DrawingSchema.nullable(),
});
export type ActionCardDto = z.infer<typeof ActionCardSchema>;
/** A trade idea the assistant presents as an interactive card: the model gives the levels, the server checks their order and computes risk, reward and size. */
export const TradePlanInputSchema = z.strictObject({
  symbol: SymbolId, interval: z.enum(INTERVALS).default('15'), side: z.enum(['buy', 'sell']),
  entry: z.number().positive(), stopLoss: z.number().positive(), targets: z.array(z.number().positive()).min(1).max(3),
  confidence: z.number().min(0).max(1), horizon: z.enum(['intraday', 'swing', 'positional']).default('intraday'),
  rationale: z.string().trim().min(10).max(600), invalidation: z.string().trim().max(200).optional(), skill: z.string().trim().max(60).optional(),
});
export type TradePlanInput = z.infer<typeof TradePlanInputSchema>;
export const TradePlanSchema = z.strictObject({
  ...TradePlanInputSchema.shape, interval: z.enum(INTERVALS), horizon: z.enum(['intraday', 'swing', 'positional']),
  id: z.uuid(), riskPerUnit: z.number().positive(), rewards: z.array(z.strictObject({ price: z.number().positive(), rewardRisk: z.number() })),
  sizing: z.strictObject({ quantity: z.number().int().positive(), riskAmount: z.number().positive(), riskPct: z.number().positive(), currency: z.string() }).nullable(),
  /** The paper order to place this plan, as a card the user confirms; null when no size fits the risk budget. */
  orderCard: ActionCardSchema.nullable(),
});
export type TradePlanDto = z.infer<typeof TradePlanSchema>;
/** Apply with the fields as the user edited them; the kind cannot change. */
export const ActionApplyRequestSchema = z.strictObject({ action: AgentActionSchema.optional() });

export const WATCH_MARKETS = ['forex', 'india', 'us', 'commodities', 'all'] as const;
/** When a background task wakes the assistant: on a schedule, when a price or indicator condition becomes true, on a matching headline, or after a calendar release. */
export const TaskTriggerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('schedule'), cron: z.string().min(9).max(60), tz: z.string().max(40).default('Asia/Kolkata') }),
  z.strictObject({ kind: z.literal('price'), symbol: SymbolId, op: z.enum(['above', 'below']), value: z.number().positive() }),
  z.strictObject({ kind: z.literal('indicator'), symbol: SymbolId, interval: z.enum(INTERVALS), indicatorId: z.string().regex(/^[a-z][a-z0-9]{0,39}$/),
    inputs: IndicatorInputValuesSchema.default({}), plot: z.string().max(40).optional(), op: z.enum(['above', 'below']), value: z.number() }),
  /** Fires once per matching headline (each headline id at most once). Empty symbols and keywords match any headline in the markets. */
  z.strictObject({ kind: z.literal('news'), markets: z.array(z.enum(WATCH_MARKETS)).min(1).max(5).default(['all']), symbols: z.array(SymbolId).max(10).default([]),
    keywords: z.array(z.string().trim().min(2).max(40)).max(10).default([]), minImpact: z.enum(NEWS_IMPACTS).default('medium') }),
  /** Fires once per matching calendar event, `afterMinutes` after its release so the market's reaction is visible. */
  z.strictObject({ kind: z.literal('event'), countries: z.array(z.string().regex(/^[A-Z]{3}$/)).max(5).default([]), title: z.string().trim().min(2).max(80).optional(),
    minImpact: z.enum(['High', 'Medium', 'Low']).default('High'), afterMinutes: z.number().int().min(0).max(120).default(5) }),
]);
export type TaskTrigger = z.infer<typeof TaskTriggerSchema>;
/** What a task may do on its own when it fires (paper money only): the limits it must stay inside. */
export const AutoTradeSchema = z.strictObject({ enabled: z.boolean(), maxRiskPct: z.number().positive().max(5).default(0.5),
  maxTradesPerDay: z.number().int().min(1).max(20).default(3), requireBacktest: z.boolean().default(true) });
export type AutoTrade = z.infer<typeof AutoTradeSchema>;
/** queued: a fire waits for a worker; running: a worker has it; idle: nothing pending (the outcome is in `lastOutcome`). */
export const TASK_RUN_STATES = ['idle', 'queued', 'running'] as const;
export const TASK_OUTCOMES = ['ran', 'report', 'silent', 'notified', 'capped', 'error'] as const;
export type TaskOutcome = (typeof TASK_OUTCOMES)[number];
export const TASK_STATES = ['active', 'paused', 'done', 'cancelled', 'expired'] as const;
/** agent: a fire runs the assistant in the task's thread. notify: a user alert; a fire only notifies. */
export const TASK_MODES = ['agent', 'notify'] as const;
/** A user alert: a price or indicator condition, once or on every crossing. */
export const AlertCreateSchema = z.strictObject({
  trigger: TaskTriggerSchema.refine(t => t.kind !== 'schedule', { message: 'alerts need a condition, not a schedule' }),
  repeat: z.boolean().default(false), note: z.string().trim().max(200).optional(),
});
export type AlertCreate = z.infer<typeof AlertCreateSchema>;
export const AgentTaskSchema = z.strictObject({
  id: z.uuid(), threadId: z.uuid().nullable(), mode: z.enum(TASK_MODES), title: z.string(), instruction: z.string(), trigger: TaskTriggerSchema, state: z.enum(TASK_STATES),
  runs: z.number().int().nonnegative(), maxRuns: z.number().int().positive(), lastRunAt: z.string().nullable(), nextRunAt: z.string().nullable(),
  lastError: z.string().nullable(), lastOutcome: z.enum(TASK_OUTCOMES).nullable(), runState: z.enum(TASK_RUN_STATES), autoTrade: AutoTradeSchema.nullable(), desk: DeskTaskSchema.nullable(), expiresAt: z.string(), createdAt: z.string(),
});
export type AgentTaskDto = z.infer<typeof AgentTaskSchema>;

/** One trade the assistant made on the user's behalf (paper), with why, and how it is going. */
export const AgentTradeSchema = z.strictObject({
  id: z.uuid(), createdAt: z.string(), venue: z.enum(['paper', 'broker']), taskId: z.uuid().nullable(), trigger: z.string(), skill: z.string().nullable(), rationale: z.string(),
  symbol: SymbolId, side: z.enum(['buy', 'sell']), quantity: z.number().int(), entry: z.number().nullable(), stopLoss: z.number().nullable(), target: z.number().nullable(),
  riskAmount: z.number().nullable(), currency: z.string(), backtest: z.string().nullable(), clientOrderId: z.string(),
  /** Later: the entry order's status and the profit or loss so far (realised exits plus the open position, marked to the last price). */
  status: z.string().nullable(), pnl: z.number().nullable(),
  /** Set when the assistant decided not to trade (for example the backtest failed its threshold); no order was placed. */
  skipped: z.string().nullable(),
});
export type AgentTradeDto = z.infer<typeof AgentTradeSchema>;
export const AgentTradesResponseSchema = z.strictObject({ items: z.array(AgentTradeSchema) });
export const AutoTradeSetSchema = z.strictObject({ autoTrade: AutoTradeSchema.nullable() });

/** The assistant run queue as the admin sees it. `failed24h` counts runs that exhausted their retries in the last day. */
export const AgentQueueStatsSchema = z.strictObject({ depth: z.number().int().nonnegative(), running: z.number().int().nonnegative(), failed24h: z.number().int().nonnegative(), concurrency: z.number().int().positive() });
export type AgentQueueStats = z.infer<typeof AgentQueueStatsSchema>;
