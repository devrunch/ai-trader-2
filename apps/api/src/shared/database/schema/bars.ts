import { boolean, date, doublePrecision, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

const prices = () => ({ open: doublePrecision('open').notNull(), high: doublePrecision('high').notNull(),
  low: doublePrecision('low').notNull(), close: doublePrecision('close').notNull(), volume: doublePrecision('volume'),
  source: text('source').notNull(), repaired: boolean('repaired').notNull().default(false) });

// The custom migration owns RANGE partitioning; Drizzle has no partition declaration.
export const bars1m = pgTable('bars_1m', {
  instrumentId: text('instrument_id').notNull(), ts: timestamp('ts', { withTimezone: true }).notNull(), ...prices(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.instrumentId, t.ts] })]);

export const bars1d = pgTable('bars_1d', {
  instrumentId: text('instrument_id').notNull(), sessionDate: date('session_date').notNull(), ...prices(),
  adjFactor: doublePrecision('adj_factor').notNull().default(1),
}, t => [primaryKey({ columns: [t.instrumentId, t.sessionDate] })]);
