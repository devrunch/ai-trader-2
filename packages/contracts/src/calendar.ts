import { z } from 'zod';

export const EVENT_IMPACTS = ['High', 'Medium', 'Low', 'Holiday'] as const;

/** What a ForexFactory event measures and what its result usually does (vendored event knowledge); `beat` says which side of the forecast is good for the currency. */
export const EventSpecSchema = z.strictObject({
  measures: z.string(), usualEffect: z.string(), why: z.string(), notes: z.string(), source: z.string(), beat: z.enum(['higher-better', 'lower-better', 'unknown']),
});
export type EventSpec = z.infer<typeof EventSpecSchema>;

/** How an event's instruments moved from the release minute: percent change of the instrument's price at +5, +15 and +60 minutes (null when no bars). */
export const EventReactionSchema = z.strictObject({
  symbol: z.string(), refPrice: z.number().nullable(), move5Pct: z.number().nullable(), move15Pct: z.number().nullable(), move60Pct: z.number().nullable(),
});
export type EventReaction = z.infer<typeof EventReactionSchema>;

/** A scheduled release or speech (CPI, Fed, ECB, payrolls…), with what it usually moves. Times are ISO with offset. */
export const EconomicEventSchema = z.strictObject({
  id: z.string(), title: z.string(), country: z.string(), at: z.string(), impact: z.enum(EVENT_IMPACTS),
  forecast: z.string().nullable(), previous: z.string().nullable(), moves: z.array(z.string()),
  /** What the event measures and how to read it; null when the event is not in the vendored specs. */
  spec: EventSpecSchema.nullable().optional(),
  /** The released value as text, once captured (with where it came from), and the surprise: actual minus forecast in the event's own units. */
  actual: z.string().nullable().optional(), actualSource: z.string().nullable().optional(), surprise: z.number().nullable().optional(),
  /** The surprise in standard deviations of this event's own surprise history (null until enough releases are stored). */
  surpriseZ: z.number().nullable().optional(),
  reactions: z.array(EventReactionSchema).optional(),
});
export type EconomicEvent = z.infer<typeof EconomicEventSchema>;
export const CalendarResponseSchema = z.strictObject({ events: z.array(EconomicEventSchema) });

export const CalendarQuerySchema = z.strictObject({
  days: z.coerce.number().int().min(1).max(14).default(7),
  /** Lowest impact to include. */
  impact: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  country: z.string().regex(/^[A-Z]{3}$/).optional(),
});
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;

/** One past release of an event with its surprise and how the instruments moved. */
export const ScorecardReleaseSchema = z.strictObject({
  eventId: z.string(), at: z.string(), forecast: z.string().nullable(), previous: z.string().nullable(), actual: z.string().nullable(), surprise: z.number().nullable(), surpriseZ: z.number().nullable(),
  reactions: z.array(EventReactionSchema),
});
export type ScorecardRelease = z.infer<typeof ScorecardReleaseSchema>;
/** For one instrument: how it moved after past releases, split by the sign of the surprise (a beat is a positive surprise). */
export const ScorecardStatSchema = z.strictObject({
  symbol: z.string(), n: z.number().int(), avgAbsMove15Pct: z.number().nullable(), avgMove15WhenBeatPct: z.number().nullable(), avgMove15WhenMissPct: z.number().nullable(),
  /** Share of releases where the 15-minute move had the sign the surprise suggests (a beat up, a miss down), in percent. */
  followedSurprisePct: z.number().nullable(),
});
export const EventScorecardSchema = z.strictObject({
  title: z.string(), country: z.string(), spec: EventSpecSchema.nullable(), releases: z.array(ScorecardReleaseSchema), stats: z.array(ScorecardStatSchema),
});
export type EventScorecard = z.infer<typeof EventScorecardSchema>;
export const ScorecardQuerySchema = z.strictObject({ title: z.string().min(2).max(120), country: z.string().regex(/^[A-Z]{3}$/).optional(), limit: z.coerce.number().int().min(1).max(40).default(12) });
