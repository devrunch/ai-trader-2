import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const promptVersions = pgTable('prompt_versions', {
  key: text('key').notNull(),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  parentVersion: integer('parent_version'),
  message: text('message').notNull(),
  author: text('author').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.key, table.version] })]);
