import { date, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const vendorSessions = pgTable('vendor_sessions', {
  vendor: text('vendor').primaryKey(),
  accessToken: text('access_token'),
  mintedAt: timestamp('minted_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  loginAttemptsDay: date('login_attempts_day'),
  loginAttempts: integer('login_attempts').notNull().default(0),
  loginAttemptsWindow: timestamp('login_attempts_window', { withTimezone: true, mode: 'date' }).array().notNull().default([]),
  autoLoginBlockedUntil: timestamp('auto_login_blocked_until', { withTimezone: true }),
  autoLoginBlockReason: text('auto_login_block_reason'),
});
