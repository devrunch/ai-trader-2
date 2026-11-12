import { NEWS_DIRECTIONS, NEWS_IMPACTS } from '@aitrader/contracts';
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
  fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [index('news_items_published').on(table.publishedAt.desc())]);
