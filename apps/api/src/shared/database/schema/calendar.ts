import { doublePrecision, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const economicEvents = pgTable('economic_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  country: text('country').notNull(),
  at: timestamp('at', { withTimezone: true, mode: 'string' }).notNull(),
  impact: text('impact').notNull(),
  forecast: text('forecast'),
  previous: text('previous'),
  /** The released value as text, the source that gave it and when it was stored; the surprise is actual minus forecast, `surprise_z` that in standard deviations of the event's own history. */
  actual: text('actual'),
  actualSource: text('actual_source'),
  actualAt: timestamp('actual_at', { withTimezone: true, mode: 'string' }),
  surprise: doublePrecision('surprise'),
  surpriseZ: doublePrecision('surprise_z'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, t => [index('economic_events_at').on(t.at), index('economic_events_title_at').on(t.country, t.title, t.at)]);
