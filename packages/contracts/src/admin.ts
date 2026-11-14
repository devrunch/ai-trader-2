import { z } from 'zod';
import { PROVIDER_REASONS } from './market-data.js';

export const FEED_VENDORS = ['kite', 'deriv', 'us-delayed'] as const;
export const FEED_STATES = ['unknown', 'connecting', 'live', 'reconnecting', 'stale', 'stopped'] as const;

export const OpsFeedsSchema = z.strictObject({
  leader: z.strictObject({ instanceId: z.string(), ttlMs: z.number().int().nonnegative() }).nullable(),
  vendors: z.array(z.strictObject({
    vendor: z.enum(FEED_VENDORS), state: z.enum(FEED_STATES),
    reason: z.enum(PROVIDER_REASONS).optional(), detail: z.string().optional(), at: z.number().int().optional(),
  })),
  subscriptions: z.array(z.strictObject({ instrumentId: z.string(), count: z.number().int().positive() })),
});
export type OpsFeeds = z.infer<typeof OpsFeedsSchema>;

export const OpsJobsSchema = z.array(z.strictObject({
  name: z.string(), cron: z.string(), tz: z.string(),
  lastRun: z.strictObject({ at: z.iso.datetime(), outcome: z.enum(['ok', 'failed', 'skipped']) }).nullable(),
  next: z.iso.datetime().nullable(),
}));
export type OpsJobs = z.infer<typeof OpsJobsSchema>;

export const OpsInstrumentsSchema = z.strictObject({
  sources: z.array(z.strictObject({
    source: z.string(), status: z.string(), reason: z.string().optional(),
    count: z.number().int().nonnegative(), lastSuccessAt: z.iso.datetime({ offset: true }).nullable(),
  })),
  total: z.number().int().nonnegative(),
});
export type OpsInstruments = z.infer<typeof OpsInstrumentsSchema>;

export const ZerodhaStatusSchema = z.strictObject({
  connected: z.boolean(),
  expiresAt: z.iso.datetime().optional(),
  autoLogin: z.strictObject({
    enabled: z.boolean(), blockedUntil: z.iso.datetime().optional(), reason: z.string().optional(),
    attemptsToday: z.number().int().nonnegative(), cap: z.literal(6),
    lastFailure: z.strictObject({ stage: z.string(), message: z.string(), httpStatus: z.number().int().optional(), at: z.iso.datetime() }).optional(),
  }),
  loginUrl: z.url(),
  redirectUrl: z.string().nullable(),
});
export type ZerodhaStatus = z.infer<typeof ZerodhaStatusSchema>;

/** What the assistant looked for and could not get: which tool, about what, why, how often. The owner adds the source or key it points to. */
export const DataGapSchema = z.strictObject({
  tool: z.string(), subject: z.string(), reason: z.string(), count: z.number().int(), example: z.string().nullable(), firstSeen: z.string(), lastSeen: z.string(),
});
export type DataGapDto = z.infer<typeof DataGapSchema>;
export const DataGapsResponseSchema = z.strictObject({ gaps: z.array(DataGapSchema) });
export type DataGapsResponse = z.infer<typeof DataGapsResponseSchema>;
