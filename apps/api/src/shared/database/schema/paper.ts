import { sql } from 'drizzle-orm';
import { boolean, index, integer, numeric, pgTable, text, timestamp, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { PAPER_CLOSE_REASONS, PAPER_ORDER_STATUSES, PAPER_ORDER_TYPES, PAPER_PRODUCTS, PAPER_REJECT_REASONS, PAPER_SEGMENTS, PAPER_SIDES } from '@aitrader/contracts';
import { users } from './users';

const money = (name: string) => numeric(name, { precision: 20, scale: 2, mode: 'number' });
const price = (name: string) => numeric(name, { precision: 20, scale: 6, mode: 'number' });
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const paperAccounts = pgTable('paper_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  currency: text('currency', { enum: ['INR'] }).notNull(),
  initialCash: money('initial_cash').notNull(), cash: money('cash').notNull(),
  realisedPnl: money('realised_pnl').notNull().default(0), charges: money('charges').notNull().default(0),
  createdAt: at('created_at').notNull().defaultNow(), updatedAt: at('updated_at').notNull().defaultNow(),
}, t => [unique('paper_accounts_user_currency_unique').on(t.userId, t.currency)]);

export const paperOrders = pgTable('paper_orders', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => paperAccounts.id, { onDelete: 'cascade' }),
  clientOrderId: text('client_order_id').notNull(), instrumentId: text('instrument_id').notNull(),
  segment: text('segment', { enum: PAPER_SEGMENTS }), tick: price('tick').notNull(),
  side: text('side', { enum: PAPER_SIDES }).notNull(), type: text('type', { enum: PAPER_ORDER_TYPES }).notNull(),
  product: text('product', { enum: PAPER_PRODUCTS }).notNull(), quantity: integer('quantity').notNull(),
  limitPrice: price('limit_price'), triggerPrice: price('trigger_price'), stopLoss: price('stop_loss'), target: price('target'),
  status: text('status', { enum: PAPER_ORDER_STATUSES }).notNull(), triggered: boolean('triggered').notNull().default(false),
  rejectReason: text('reject_reason', { enum: PAPER_REJECT_REASONS }), closeReason: text('close_reason', { enum: PAPER_CLOSE_REASONS }),
  parentOrderId: uuid('parent_order_id').references((): AnyPgColumn => paperOrders.id, { onDelete: 'cascade' }),
  referencePrice: price('reference_price'), fillPrice: price('fill_price'),
  placedAt: at('placed_at').notNull(), expiresAt: at('expires_at').notNull(), filledAt: at('filled_at'), updatedAt: at('updated_at').notNull(),
}, t => [
  // FR-PT-3: the idempotency key.
  unique('paper_orders_account_client_unique').on(t.accountId, t.clientOrderId),
  index('paper_orders_account_placed_idx').on(t.accountId, t.placedAt),
  index('paper_orders_open_idx').on(t.expiresAt).where(sql`status = 'open'`),
]);

export const paperFills = pgTable('paper_fills', {
  id: uuid('id').primaryKey(),
  // One fill per order: a second fill of the same order fails here even if the status guard were bypassed.
  orderId: uuid('order_id').notNull().unique('paper_fills_order_unique').references(() => paperOrders.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => paperAccounts.id, { onDelete: 'cascade' }),
  instrumentId: text('instrument_id').notNull(), side: text('side', { enum: PAPER_SIDES }).notNull(),
  product: text('product', { enum: PAPER_PRODUCTS }).notNull(), quantity: integer('quantity').notNull(),
  price: price('price').notNull(), slippage: price('slippage').notNull(),
  brokerage: money('brokerage').notNull(), stt: money('stt').notNull(), exchangeCharges: money('exchange_charges').notNull(),
  sebi: money('sebi').notNull(), stamp: money('stamp').notNull(), gst: money('gst').notNull(), totalCharges: money('total_charges').notNull(),
  realisedPnl: money('realised_pnl').notNull(), filledAt: at('filled_at').notNull(),
}, t => [index('paper_fills_account_filled_idx').on(t.accountId, t.filledAt)]);

export const paperPositions = pgTable('paper_positions', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => paperAccounts.id, { onDelete: 'cascade' }),
  instrumentId: text('instrument_id').notNull(), segment: text('segment', { enum: PAPER_SEGMENTS }).notNull(), tick: price('tick').notNull(),
  product: text('product', { enum: PAPER_PRODUCTS }).notNull(), quantity: integer('quantity').notNull(),
  averagePrice: price('average_price').notNull(), realisedPnl: money('realised_pnl').notNull(),
  squareOffAt: at('square_off_at'), updatedAt: at('updated_at').notNull(),
}, t => [
  unique('paper_positions_account_instrument_product_unique').on(t.accountId, t.instrumentId, t.product),
  index('paper_positions_square_off_idx').on(t.squareOffAt).where(sql`product = 'MIS' AND quantity <> 0`),
]);
