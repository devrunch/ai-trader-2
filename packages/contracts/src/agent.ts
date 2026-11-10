import { z } from 'zod';
import { IndicatorInputValuesSchema } from './indicator.js';
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
/** What the model may propose directly; drawings go through their intent so the server computes the geometry. */
export const ChartActionSchema = z.discriminatedUnion('kind', [AddIndicator, OpenSymbol]);
export const AgentActionSchema = z.discriminatedUnion('kind', [AddIndicator, OpenSymbol, z.strictObject({ kind: z.literal('draw'), intent: DrawingIntentSchema })]);
export type AgentAction = z.infer<typeof AgentActionSchema>;
export const ACTION_CARD_STATES = ['pending', 'applied', 'dismissed', 'expired', 'failed'] as const;
export const ActionCardSchema = z.strictObject({
  id: z.uuid(), action: AgentActionSchema, state: z.enum(ACTION_CARD_STATES), reason: z.string().nullable(), expiresAt: z.string(),
  /** Server-computed geometry for a `draw` card: a preview when proposed, recomputed from fresh bars on apply. */
  drawing: DrawingSchema.nullable(),
});
export type ActionCardDto = z.infer<typeof ActionCardSchema>;
/** Apply with the fields as the user edited them; the kind cannot change. */
export const ActionApplyRequestSchema = z.strictObject({ action: AgentActionSchema.optional() });
