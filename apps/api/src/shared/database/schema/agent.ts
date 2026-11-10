import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const agentThreads = pgTable('agent_threads', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [index('agent_threads_user_updated').on(table.userId, table.updatedAt.desc())]);

export const agentMessages = pgTable('agent_messages', {
  threadId: uuid('thread_id').notNull().references(() => agentThreads.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  message: jsonb('message').notNull(),
}, table => [primaryKey({ columns: [table.threadId, table.seq] })]);

export const agentTurns = pgTable('agent_turns', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  threadId: uuid('thread_id').notNull(),
  promptKey: text('prompt_key').notNull(),
  promptVersion: integer('prompt_version').notNull(),
  model: text('model').notNull(),
  outcome: text('outcome'),
  tokens: integer('tokens'),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'string' }),
}, table => [index('agent_turns_prompt').on(table.promptKey, table.promptVersion)]);

export const agentActions = pgTable('agent_actions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: jsonb('action').notNull(),
  state: text('state').notNull(),
  reason: text('reason'),
  drawing: jsonb('drawing'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
});
