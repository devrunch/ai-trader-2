import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const newsItems = pgTable('news_items', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  summary: text('summary'),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }).notNull(),
  symbols: text('symbols').array().notNull().default([]),
  fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [index('news_items_published').on(table.publishedAt.desc())]);
