import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const vendorSessions = pgTable('vendor_sessions', {
  vendor: text('vendor').primaryKey(),
  accessToken: text('access_token').notNull(),
  mintedAt: timestamp('minted_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
