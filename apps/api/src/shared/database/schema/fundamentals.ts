import { boolean, date, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** One row per fetch of a company's fundamentals; `data` is the full record, the columns are what queries filter on. */
export const fundamentals = pgTable('fundamentals', {
  symbol: text('symbol').notNull(),
  consolidated: boolean('consolidated').notNull(),
  source: text('source').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'string' }).notNull(),
  reportDate: date('report_date', { mode: 'string' }),
  data: jsonb('data').notNull(),
}, table => [primaryKey({ columns: [table.symbol, table.fetchedAt] }), index('fundamentals_fetched').on(table.fetchedAt.desc())]);
