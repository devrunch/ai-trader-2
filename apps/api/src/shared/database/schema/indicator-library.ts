import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { IndicatorChartInputs, IndicatorInputValues, TemplateItem } from '@aitrader/contracts';
import { users } from './users';

export const indicatorPresets = pgTable('indicator_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  indicatorId: text('indicator_id').notNull(),
  name: text('name'),
  inputs: jsonb('inputs').$type<IndicatorInputValues>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const indicatorTemplates = pgTable('indicator_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  favourite: boolean('favourite').notNull().default(false),
  items: jsonb('items').$type<(Omit<TemplateItem, 'inputs'> & { inputs: IndicatorChartInputs })[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
