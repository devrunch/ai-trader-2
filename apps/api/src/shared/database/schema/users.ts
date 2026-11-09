import { boolean, integer, pgTable, text, timestamp, uuid, customType } from 'drizzle-orm/pg-core';
const citext = customType<{ data: string }>({ dataType: () => 'citext' });
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(), username: citext('username').notNull().unique(), passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  disabled: boolean('disabled').notNull().default(false), failedLogins: integer('failed_logins').notNull().default(0), lockedUntil: timestamp('locked_until', { withTimezone: true }),
});
