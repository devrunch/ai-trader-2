import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const pineScripts = pgTable('pine_scripts', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [index('pine_scripts_user_updated').on(table.userId, table.updatedAt.desc())]);

export const pineScriptVersions = pgTable('pine_script_versions', {
  scriptId: uuid('script_id').notNull().references(() => pineScripts.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  source: text('source').notNull(),
  sourceHash: text('source_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.scriptId, table.version] })]);
