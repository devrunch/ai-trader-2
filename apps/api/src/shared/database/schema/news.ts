import { NEWS_DIRECTIONS, NEWS_IMPACTS, SENTIMENT_LABELS } from '@aitrader/contracts';
import { boolean, index, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const newsItems = pgTable('news_items', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  summary: text('summary'),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }).notNull(),
  symbols: text('symbols').array().notNull().default([]),
  impact: text('impact', { enum: NEWS_IMPACTS }).notNull().default('low'),
  moves: text('moves').array().notNull().default([]),
  direction: text('direction', { enum: NEWS_DIRECTIONS }),
  markets: text('markets').array().notNull().default([]),
  sentimentLabel: text('sentiment_label', { enum: SENTIMENT_LABELS }),
  sentimentScore: real('sentiment_score'),
  sentimentBy: text('sentiment_by', { enum: ['llm', 'finbert', 'rules', 'vendor'] }),
  crowd: boolean('crowd').notNull().default(false),
  fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [
  index('news_items_published').on(table.publishedAt.desc()),
  index('news_items_symbols').using('gin', table.symbols),
  index('news_items_markets').using('gin', table.markets),
  index('news_items_unscored').on(table.publishedAt.desc()).where(sql`${table.sentimentLabel} is null`),
]);

/** Per-user email opt-ins. A missing row means everything is off. */
export const userEmailPrefs = pgTable('user_email_prefs', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  reports: boolean('reports').notNull().default(false),
  address: text('address'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
