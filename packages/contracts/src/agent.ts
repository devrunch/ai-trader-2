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
