import { doublePrecision, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** Short-lived option chain snapshots: the cache for repeat reads and the previous-day baseline for open-interest change. */
export const optionSnapshots = pgTable('option_snapshots', {
  underlying: text('underlying').notNull(),
  expiry: text('expiry').notNull(),
  takenAt: timestamp('taken_at', { withTimezone: true, mode: 'string' }).notNull(),
  spot: doublePrecision('spot'),
  legs: jsonb('legs').notNull(),
}, t => [primaryKey({ columns: [t.underlying, t.expiry, t.takenAt] }), index('option_snapshots_taken').on(t.takenAt)]);
