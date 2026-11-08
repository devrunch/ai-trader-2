import { sql } from 'drizzle-orm';
import { bigserial, boolean, date, index, integer, numeric, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const instruments = pgTable('instruments', {
  id: text('id').primaryKey(), exchange: text('exchange').notNull(), ticker: text('ticker').notNull(),
  description: text('description').notNull(), type: text('type').notNull(), currency: text('currency').notNull(),
  timezone: text('timezone').notNull(), session: text('session').notNull(), pricescale: integer('pricescale').notNull(),
  minmov: numeric('minmov', { mode: 'number' }).notNull(), lotSize: integer('lot_size').notNull(),
  expiry: date('expiry'), strike: numeric('strike', { mode: 'number' }), optionType: text('option_type'), underlying: text('underlying'),
  isin: text('isin'), sector: text('sector'), hasIntraday: boolean('has_intraday').notNull(), volumeType: text('volume_type').notNull(),
  status: text('status').notNull(), aliases: text('aliases').array().notNull().default(sql`'{}'`),
  source: text('source').notNull(), updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
}, t => [index('instruments_source_idx').on(t.source), index('instruments_status_idx').on(t.status),
  index('instruments_underlying_idx').on(t.underlying), index('instruments_expiry_idx').on(t.expiry)]);

export const instrumentMappings = pgTable('instrument_mappings', {
  id: text('id').notNull().references(() => instruments.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), providerSymbol: text('provider_symbol').notNull(), providerToken: text('provider_token'),
}, t => [primaryKey({ columns: [t.id, t.provider] }), unique('instrument_mappings_provider_symbol_unique').on(t.provider, t.providerSymbol)]);

export const instrumentChanges = pgTable('instrument_changes', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(), kind: text('kind').notNull(), id: text('id').notNull(),
  successor: text('successor'), at: timestamp('at', { withTimezone: true, mode: 'string' }).notNull(), source: text('source').notNull(),
}, t => [index('instrument_changes_id_idx').on(t.id), index('instrument_changes_successor_idx').on(t.successor)]);

export const instrumentSourceStatus = pgTable('instrument_source_status', {
  source: text('source').primaryKey(), status: text('status').notNull(), reason: text('reason'),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'string' }),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true, mode: 'string' }).notNull(),
  instrumentCount: integer('instrument_count').notNull().default(0),
});
