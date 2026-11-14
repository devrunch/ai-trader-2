import { z } from 'zod';

const shortList = (max: number) => z.array(z.string().trim().min(1).max(40)).max(max);

/** What the assistant knows about how this user trades and likes to be answered. Every field is optional and editable. */
export const AgentProfileSchema = z.strictObject({
  markets: shortList(10).optional(),
  instruments: shortList(20).optional(),
  timeframes: shortList(8).optional(),
  riskPerTradePct: z.number().gt(0).max(100).optional(),
  autonomy: z.enum(['ask', 'within-limits']).optional(),
  length: z.enum(['short', 'detailed']).optional(),
  format: z.enum(['cards', 'text']).optional(),
  language: z.string().trim().min(2).max(30).optional(),
});
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

export const LearnedItemSchema = z.strictObject({ id: z.uuid(), kind: z.string(), topic: z.string(), tools: z.array(z.string()), createdAt: z.string() });
export type LearnedItem = z.infer<typeof LearnedItemSchema>;

export const AgentKnowledgeSchema = z.strictObject({
  profile: AgentProfileSchema,
  notes: z.array(z.strictObject({ id: z.uuid(), note: z.string(), createdAt: z.string() })),
  learned: z.array(LearnedItemSchema),
  summary: z.string(),
});
export type AgentKnowledge = z.infer<typeof AgentKnowledgeSchema>;

/** A thumbs mark under a reply: the reply is the `turnIndex`-th assistant answer of the thread. */
export const AgentFeedbackRequestSchema = z.strictObject({ threadId: z.uuid(), turnIndex: z.number().int().min(0).max(10_000), value: z.enum(['up', 'down']) });
export type AgentFeedbackRequest = z.infer<typeof AgentFeedbackRequestSchema>;
