import { z } from 'zod';

export const PINE_SCRIPT_LIMITS = { scripts: 100, versions: 50, sourceChars: 100_000, nameChars: 80 } as const;

const NameSchema = z.string().trim().min(1).max(PINE_SCRIPT_LIMITS.nameChars);
const SourceSchema = z.string().min(1).max(PINE_SCRIPT_LIMITS.sourceChars);

/** One saved version: `sourceHash` is the SHA-256 (hex) of the exact source (FR-IN-28). */
export const PineScriptVersionSchema = z.strictObject({ version: z.number().int().positive(), sourceHash: z.string().regex(/^[0-9a-f]{64}$/), createdAt: z.string() });
export type PineScriptVersion = z.infer<typeof PineScriptVersionSchema>;

export const PineScriptSummarySchema = z.strictObject({
  id: z.uuid(), name: NameSchema, currentVersion: z.number().int().positive(), sourceHash: z.string().regex(/^[0-9a-f]{64}$/), updatedAt: z.string(),
});
export type PineScriptSummary = z.infer<typeof PineScriptSummarySchema>;

/** A script with the source of one version (the latest unless asked) and the version history, newest first. */
export const PineScriptDetailSchema = PineScriptSummarySchema.extend({ source: SourceSchema, shownVersion: z.number().int().positive(), versions: z.array(PineScriptVersionSchema) });
export type PineScriptDetail = z.infer<typeof PineScriptDetailSchema>;

export const PineScriptListResponseSchema = z.strictObject({ scripts: z.array(PineScriptSummarySchema) });
export const PineScriptCreateRequestSchema = z.strictObject({ name: NameSchema, source: SourceSchema });
/** Saving the same source as the latest version changes nothing; a new source adds a version, and the oldest beyond the cap is dropped. */
export const PineScriptSaveRequestSchema = z.strictObject({ name: NameSchema.optional(), source: SourceSchema });
export const PineScriptVersionQuerySchema = z.object({ version: z.coerce.number().int().positive().optional() });

/** One row of the generated coverage report (FR-IN-26): what the Pine runtime runs and what it refuses. */
export const PineCoverageRowSchema = z.strictObject({
  group: z.string(), feature: z.string(), status: z.enum(['supported', 'refused']), note: z.string(),
});
export type PineCoverageRow = z.infer<typeof PineCoverageRowSchema>;
