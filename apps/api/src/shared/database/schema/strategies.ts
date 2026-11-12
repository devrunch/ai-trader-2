import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/** A user's saved backtest spec. `variant_hashes` holds one fingerprint per distinct parameter set run against it. */
export const strategies = pgTable('strategies', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  spec: jsonb('spec').notNull(),
  variantHashes: text('variant_hashes').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
}, table => [index('strategies_user_updated').on(table.userId, table.updatedAt.desc())]);
