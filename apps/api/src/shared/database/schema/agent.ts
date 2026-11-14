import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
  tools: text('tools').array().notNull().default([]),
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

export const agentTasks = pgTable('agent_tasks', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  threadId: uuid('thread_id'),
  mode: text('mode').notNull().default('agent'),
  title: text('title').notNull(),
  instruction: text('instruction').notNull(),
  trigger: jsonb('trigger').notNull(),
  state: text('state').notNull(),
  runs: integer('runs').notNull().default(0),
  maxRuns: integer('max_runs').notNull(),
  armed: boolean('armed').notNull(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true, mode: 'string' }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true, mode: 'string' }),
  lastError: text('last_error'),
  lastOutcome: text('last_outcome'),
  seen: text('seen').array().notNull().default([]),
  autoTrade: jsonb('auto_trade'),
  desk: jsonb('desk'),
  runState: text('run_state').notNull().default('idle'),
  runStateAt: timestamp('run_state_at', { withTimezone: true, mode: 'string' }),
  pendingFire: jsonb('pending_fire'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
});

export const agentMemory = pgTable('agent_memory', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  note: text('note').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

/** Orders the assistant placed on the user's behalf, with why. Outcome is read from the paper engine, not stored. */
export const agentTrades = pgTable('agent_trades', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  venue: text('venue').notNull(),
  trigger: text('trigger_text').notNull(),
  skill: text('skill'),
  rationale: text('rationale').notNull(),
  symbol: text('symbol').notNull(),
  side: text('side').notNull(),
  quantity: integer('quantity').notNull(),
  entry: doublePrecision('entry'),
  stopLoss: doublePrecision('stop_loss'),
  target: doublePrecision('target'),
  riskAmount: doublePrecision('risk_amount'),
  currency: text('currency').notNull(),
  backtest: text('backtest'),
  clientOrderId: text('client_order_id').notNull(),
  skipped: text('skipped'),
}, table => [uniqueIndex('agent_trades_client_order').on(table.userId, table.clientOrderId), index('agent_trades_user_created').on(table.userId, table.createdAt.desc()),
  index('agent_trades_task_created').on(table.taskId, table.createdAt)]);

/** Per-user execution settings. Broker opt-in is off by default and has no effect outside development with EXECUTION_MODE=broker. */
export const executionPrefs = pgTable('execution_prefs', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  brokerOptIn: boolean('broker_opt_in').notNull().default(false),
});

/** One trading-desk decision with its full reasoning trail; `as_of` is the moment the desk's data was cut at. */
export const deskRuns = pgTable('desk_runs', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(),
  asOf: timestamp('as_of', { withTimezone: true, mode: 'string' }).notNull(),
  live: boolean('live').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  status: text('status').notNull(),
  decision: jsonb('decision').notNull(),
  trail: jsonb('trail').notNull(),
  tokens: integer('tokens').notNull(),
  calls: integer('calls').notNull(),
  error: text('error'),
}, table => [index('desk_runs_user_created').on(table.userId, table.createdAt.desc()), index('desk_runs_user_symbol').on(table.userId, table.symbol, table.createdAt.desc())]);

/** A desk backtest: the desk run over past dates and scored on what happened next. Progress and results are written as it goes. */
export const deskBacktests = pgTable('desk_backtests', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(),
  request: jsonb('request').notNull(),
  status: text('status').notNull(),
  done: integer('done').notNull(),
  total: integer('total').notNull(),
  items: jsonb('items').notNull(),
  summary: jsonb('summary'),
  tokens: integer('tokens').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'string' }),
  error: text('error'),
}, table => [index('desk_backtests_user_created').on(table.userId, table.createdAt.desc())]);

export const agentProfile = pgTable('agent_profile', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

/** One thing the user did with an answer (card applied or dismissed, thumbs); `event_key` makes recording it twice a no-op. */
export const agentSignals = pgTable('agent_signals', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventKey: text('event_key').notNull(),
  kind: text('kind').notNull(),
  topic: text('topic').notNull(),
  tools: text('tools').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [uniqueIndex('agent_signals_event').on(table.userId, table.eventKey)]);
