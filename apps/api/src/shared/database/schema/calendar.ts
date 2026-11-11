import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const economicEvents = pgTable('economic_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  country: text('country').notNull(),
  at: timestamp('at', { withTimezone: true, mode: 'string' }).notNull(),
  impact: text('impact').notNull(),
  forecast: text('forecast'),
  previous: text('previous'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, t => [index('economic_events_at').on(t.at)]);
