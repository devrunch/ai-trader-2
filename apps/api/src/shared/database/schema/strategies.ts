import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { savedSpecColumns } from './saved-spec-columns';

/** A user's saved backtest spec. `variant_hashes` holds one fingerprint per distinct parameter set run against it. */
export const strategies = pgTable('strategies', {
  ...savedSpecColumns,
  variantHashes: text('variant_hashes').array().notNull().default([]),
}, table => [index('strategies_user_updated').on(table.userId, table.updatedAt.desc())]);
