import { doublePrecision, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** How an instrument moved after an economic event's release minute (+5, +15, +60 minutes). */
export const eventReactions = pgTable('event_reactions', {
  eventId: text('event_id').notNull(), symbol: text('symbol').notNull(), refPrice: doublePrecision('ref_price'),
  move5Pct: doublePrecision('move5_pct'), move15Pct: doublePrecision('move15_pct'), move60Pct: doublePrecision('move60_pct'),
  computedAt: timestamp('computed_at', { withTimezone: true, mode: 'string' }).notNull(),
}, t => [primaryKey({ columns: [t.eventId, t.symbol] })]);
