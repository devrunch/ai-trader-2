import { z } from 'zod';

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
