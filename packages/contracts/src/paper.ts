import { z } from 'zod';

export const PAPER_SIDES = ['buy', 'sell'] as const;
export type PaperSide = (typeof PAPER_SIDES)[number];
/** `stop` is a stop-market order (SL-M); `stop_limit` becomes a limit order once triggered (SL). */
export const PAPER_ORDER_TYPES = ['market', 'limit', 'stop', 'stop_limit'] as const;
export type PaperOrderType = (typeof PAPER_ORDER_TYPES)[number];
/** MIS intraday (squared off before the close), CNC equity delivery, NRML derivatives carry-forward. */
export const PAPER_PRODUCTS = ['MIS', 'CNC', 'NRML'] as const;
export type PaperProduct = (typeof PAPER_PRODUCTS)[number];
export const PAPER_SEGMENTS = ['equity', 'futures', 'options', 'commodity', 'us-equity', 'forex'] as const;
export type PaperSegment = (typeof PAPER_SEGMENTS)[number];
export const PAPER_ORDER_STATUSES = ['open', 'filled', 'cancelled', 'rejected', 'expired'] as const;
export type PaperOrderStatus = (typeof PAPER_ORDER_STATUSES)[number];
export const PAPER_REJECT_REASONS = [
  'INSTRUMENT_NOT_ALLOWED', 'MARKET_CLOSED', 'MIS_CUTOFF', 'NO_PRICE', 'PRICE_BAND', 'TRIGGER_INVALID',
  'MAX_ORDER_VALUE', 'MAX_POSITION_VALUE', 'MAX_OPEN_POSITIONS', 'DAILY_LOSS_LIMIT', 'SHORT_DELIVERY',
  'OPTION_WRITING', 'INSUFFICIENT_MARGIN',
] as const;
export type PaperRejectReason = (typeof PAPER_REJECT_REASONS)[number];
/** Why an order left the book without a fill. */
export const PAPER_CLOSE_REASONS = ['USER', 'OCO', 'SQUARE_OFF', 'SESSION_END'] as const;
export type PaperCloseReason = (typeof PAPER_CLOSE_REASONS)[number];

const price = z.number().positive().max(1e9);

export const PaperPlaceOrderRequestSchema = z.strictObject({
  clientOrderId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/),
  instrumentId: z.string().trim().min(3).max(80),
  side: z.enum(PAPER_SIDES), type: z.enum(PAPER_ORDER_TYPES), product: z.enum(PAPER_PRODUCTS),
  quantity: z.number().int().positive().max(10_000_000),
  limitPrice: price.optional(), triggerPrice: price.optional(), stopLoss: price.optional(), target: price.optional(),
});
export type PaperPlaceOrderRequest = z.infer<typeof PaperPlaceOrderRequestSchema>;

export const PaperOrderSchema = z.strictObject({
  id: z.string(), clientOrderId: z.string(), instrumentId: z.string(), currency: z.string(),
  side: z.enum(PAPER_SIDES), type: z.enum(PAPER_ORDER_TYPES), product: z.enum(PAPER_PRODUCTS), quantity: z.number().int(),
  limitPrice: z.number().nullable(), triggerPrice: z.number().nullable(), stopLoss: z.number().nullable(), target: z.number().nullable(),
  status: z.enum(PAPER_ORDER_STATUSES), triggered: z.boolean(),
  rejectReason: z.enum(PAPER_REJECT_REASONS).nullable(), closeReason: z.enum(PAPER_CLOSE_REASONS).nullable(),
  parentOrderId: z.string().nullable(), fillPrice: z.number().nullable(),
  placedAt: z.number().int(), expiresAt: z.number().int(), filledAt: z.number().int().nullable(), updatedAt: z.number().int(),
});
export type PaperOrder = z.infer<typeof PaperOrderSchema>;

export const PaperChargesSchema = z.strictObject({
  brokerage: z.number(), stt: z.number(), exchange: z.number(), sebi: z.number(), stamp: z.number(), gst: z.number(), total: z.number(),
});
export type PaperCharges = z.infer<typeof PaperChargesSchema>;

export const PaperFillSchema = z.strictObject({
  id: z.string(), orderId: z.string(), instrumentId: z.string(), currency: z.string(), side: z.enum(PAPER_SIDES), product: z.enum(PAPER_PRODUCTS),
  quantity: z.number().int(), price: z.number(), slippage: z.number(), charges: PaperChargesSchema, realisedPnl: z.number(),
  filledAt: z.number().int(),
});
export type PaperFill = z.infer<typeof PaperFillSchema>;

export const PaperPositionSchema = z.strictObject({
  instrumentId: z.string(), currency: z.string(), product: z.enum(PAPER_PRODUCTS), quantity: z.number().int(), averagePrice: z.number(),
  realisedPnl: z.number(), lastPrice: z.number().nullable(), unrealisedPnl: z.number().nullable(), squareOffAt: z.number().int().nullable(),
});
export type PaperPosition = z.infer<typeof PaperPositionSchema>;

export const PaperAccountSchema = z.strictObject({
  id: z.string(), currency: z.string().regex(/^[A-Z]{3}$/), initialCash: z.number(), cash: z.number(),
  usedMargin: z.number(), available: z.number(), realisedPnl: z.number(), charges: z.number(),
});
export type PaperAccount = z.infer<typeof PaperAccountSchema>;

export const PaperOrderResponseSchema = z.strictObject({ order: PaperOrderSchema });
export const PaperOrdersResponseSchema = z.strictObject({ orders: z.array(PaperOrderSchema) });
export const PaperPositionsResponseSchema = z.strictObject({ positions: z.array(PaperPositionSchema) });
export const PaperFillsResponseSchema = z.strictObject({ fills: z.array(PaperFillSchema) });
export const PaperAccountResponseSchema = z.strictObject({ account: PaperAccountSchema });
/** One account per currency, rupees first. */
export const PaperAccountsResponseSchema = z.strictObject({ accounts: z.array(PaperAccountSchema) });
