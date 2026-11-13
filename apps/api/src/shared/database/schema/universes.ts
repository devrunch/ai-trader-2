import { date, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Index constituents as last fetched (nifty50, nifty100, nifty500): members is [{ id, name }], list_date the day the list was fetched. */
export const universeConstituents = pgTable('universe_constituents', {
  indexId: text('index_id').primaryKey(), members: jsonb('members').notNull(), listDate: date('list_date').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'string' }).notNull(), source: text('source').notNull(),
});
