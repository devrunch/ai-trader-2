import { z } from 'zod';

/** One row of the admin "Data sources" view: the registry joined with health. */
export const DataSourceSchema = z.strictObject({
  id: z.string(), owner: z.string(), kind: z.string(), markets: z.array(z.string()), envKeys: z.array(z.string()), state: z.enum(['enabled', 'off']), missingKeys: z.array(z.string()),
  rateLimit: z.strictObject({ requests: z.number(), windowSec: z.number() }), schedule: z.string(), terms: z.string(), docs: z.string(),
  lastSuccessAt: z.string().nullable(), lastError: z.string().nullable(), lastErrorAt: z.string().nullable(), lastLatencyMs: z.number().nullable(),
  items24h: z.number().int(), rateLimitHits24h: z.number().int(),
});
export type DataSourceDto = z.infer<typeof DataSourceSchema>;
export const DataSourcesResponseSchema = z.strictObject({ sources: z.array(DataSourceSchema) });
