import { jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/** Columns every per-user saved spec table shares. */
export const savedSpecColumns = {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  spec: jsonb('spec').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
};
