import { z } from 'zod';
import { BacktestConditionSchema, BacktestIndicatorSchema } from './backtest.js';

export const UNIVERSES = ['nifty50', 'nifty100', 'nifty500', 'forex-majors', 'forex-crosses', 'commodities', 'us-large', 'crypto-majors', 'watchlist'] as const;
export type UniverseId = (typeof UNIVERSES)[number];
/** Scans run on the latest closed bar of stored data at these intervals. */
export const SCREEN_INTERVALS = ['15', '60', '1D'] as const;
export const SCREEN_LIMITS = { maxUniverse: 500, maxResults: 200, perUser: 30 } as const;

/** Company fundamentals a screen can filter on (Indian equities only; from the fundamentals module). */
export const FUNDAMENTAL_FIELDS = ['marketCap', 'pe', 'bookValue', 'roe', 'roce', 'dividendYield', 'debtToEquity', 'salesGrowth3y', 'salesGrowth5y', 'profitGrowth3y', 'profitGrowth5y', 'promoterHolding'] as const;
export type FundamentalField = (typeof FUNDAMENTAL_FIELDS)[number];
export const FundamentalFilterSchema = z.strictObject({ field: z.enum(FUNDAMENTAL_FIELDS), op: z.enum(['gt', 'gte', 'lt', 'lte']), value: z.number() });
export type FundamentalFilter = z.infer<typeof FundamentalFilterSchema>;

export const ScreenPresetSchema = z.strictObject({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), name: z.string(), description: z.string() });
export type ScreenPreset = z.infer<typeof ScreenPresetSchema>;
export const UniverseInfoSchema = z.strictObject({ id: z.enum(UNIVERSES), name: z.string(), count: z.number().int().nonnegative(), note: z.string().nullable() });
export type UniverseInfo = z.infer<typeof UniverseInfoSchema>;

/** A screen: a universe, an interval, and either a preset or custom conditions (the backtest condition DSL), optionally with fundamental filters. */
export const ScreenSpecSchema = z.strictObject({
  universe: z.enum(UNIVERSES), interval: z.enum(SCREEN_INTERVALS).default('1D'),
  preset: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  indicators: z.array(BacktestIndicatorSchema).max(6).default([]), condition: BacktestConditionSchema.optional(),
  fundamentals: z.array(FundamentalFilterSchema).max(8).default([]),
  limit: z.number().int().min(1).max(SCREEN_LIMITS.maxResults).default(50),
}).refine(s => s.preset !== undefined || s.condition !== undefined || s.fundamentals.length > 0, { message: 'give a preset, conditions or fundamental filters', path: ['preset'] });
export type ScreenSpec = z.infer<typeof ScreenSpecSchema>;

export const ScanRowSchema = z.strictObject({
  symbol: z.string(), name: z.string().nullable(), last: z.number(), changePct: z.number().nullable(), barTime: z.number(),
  /** The values that decided the match (indicator series and fundamentals), by name. */
  values: z.record(z.string(), z.number().nullable()), spark: z.array(z.number()).max(40),
});
export type ScanRow = z.infer<typeof ScanRowSchema>;
export const ScanResultSchema = z.strictObject({
  universe: z.enum(UNIVERSES), interval: z.enum(SCREEN_INTERVALS), preset: z.string().nullable(),
  /** Time of the newest closed bar the scan used (ms). */ asOfBar: z.number().nullable(),
  scanned: z.number().int(), matched: z.number().int(), rows: z.array(ScanRowSchema),
  /** Symbols without fresh enough data: listed here, never silently dropped. */
  stale: z.array(z.strictObject({ symbol: z.string(), reason: z.string() })),
  durationMs: z.number().int(), cached: z.boolean(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;
export const ScanRequestSchema = z.strictObject({ spec: ScreenSpecSchema });

export const SavedScreenSchema = z.strictObject({ id: z.uuid(), name: z.string().trim().min(1).max(80), spec: ScreenSpecSchema, createdAt: z.string(), updatedAt: z.string() });
export type SavedScreen = z.infer<typeof SavedScreenSchema>;
export const SavedScreenListSchema = z.strictObject({ items: z.array(SavedScreenSchema) });
export const SavedScreenCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(80), spec: ScreenSpecSchema });
export const SavedScreenUpdateSchema = z.strictObject({ name: z.string().trim().min(1).max(80).optional(), spec: ScreenSpecSchema.optional() });
export const ScreenPresetListSchema = z.strictObject({ items: z.array(ScreenPresetSchema) });
export const UniverseListSchema = z.strictObject({ items: z.array(UniverseInfoSchema) });
