import { index, pgTable } from 'drizzle-orm/pg-core';
import { savedSpecColumns } from './saved-spec-columns';

/** A user's saved screener spec (universe, interval, preset or conditions, fundamental filters). */
export const savedScreens = pgTable('saved_screens', savedSpecColumns, table => [index('saved_screens_user_updated').on(table.userId, table.updatedAt.desc())]);
