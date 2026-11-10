import type { PaperCharges, PaperCloseReason, PaperOrderStatus, PaperOrderType, PaperProduct, PaperRejectReason, PaperSide } from '@aitrader/contracts';
import type { Segment } from '../../domain/segment';

export interface AccountRecord {
  id: string;
  userId: string;
  currency: 'INR';
  initialCash: number;
  /** initialCash + realisedPnl − charges. */
  cash: number;
  realisedPnl: number;
  charges: number;
}

export interface OrderRecord {
  id: string;
  accountId: string;
  /** Exits get `<entry id>#sl` and `#tp`, square-offs `squareoff#…`; `#` is outside the client alphabet, so they never collide. */
  clientOrderId: string;
  instrumentId: string;
  /** null only on orders rejected as not tradable. */
  segment: Segment | null;
  tick: number;
  side: PaperSide;
  type: PaperOrderType;
  product: PaperProduct;
  quantity: number;
  limitPrice: number | null;
  triggerPrice: number | null;
  stopLoss: number | null;
  target: number | null;
  status: PaperOrderStatus;
  triggered: boolean;
  rejectReason: PaperRejectReason | null;
  closeReason: PaperCloseReason | null;
  /** Set on the stop-loss and target exits created when the entry fills; they cancel each other (OCO). */
  parentOrderId: string | null;
  /** The last price at placement, used to value a working market order. */
  referencePrice: number | null;
  fillPrice: number | null;
  placedAt: number;
  expiresAt: number;
  filledAt: number | null;
  updatedAt: number;
}

export interface FillRecord {
  id: string;
  orderId: string;
  accountId: string;
  instrumentId: string;
  side: PaperSide;
  product: PaperProduct;
  quantity: number;
  price: number;
  slippage: number;
  charges: PaperCharges;
  realisedPnl: number;
  filledAt: number;
}

export interface PositionRecord {
  id: string;
  accountId: string;
  instrumentId: string;
  segment: Segment;
  tick: number;
  product: PaperProduct;
  /** Signed: positive long, negative short. */
  quantity: number;
  averagePrice: number;
  realisedPnl: number;
  /** MIS only: when the square-off job flattens it. */
  squareOffAt: number | null;
  updatedAt: number;
}

export type OrderClose = { status: 'filled'; fillPrice: number; filledAt: number }
  | { status: 'cancelled' | 'expired'; closeReason: PaperCloseReason };

/** Work inside one transaction holding the account row lock; every write is visible to later reads in it. */
export interface PaperUnitOfWork {
  account(): Promise<AccountRecord>;
  orderByClientId(clientOrderId: string): Promise<OrderRecord | null>;
  order(id: string): Promise<OrderRecord | null>;
  openOrders(): Promise<OrderRecord[]>;
  positions(): Promise<PositionRecord[]>;
  /** Realised P&L net of charges for fills at or after `since`. */
  netPnlSince(since: number): Promise<number>;
  insertOrder(order: OrderRecord): Promise<void>;
  /** Moves an open order to a final state; false when it was no longer open (the idempotency guard). */
  closeOrder(id: string, close: OrderClose, at: number): Promise<boolean>;
  markTriggered(id: string, at: number): Promise<void>;
  insertFill(fill: FillRecord): Promise<void>;
  /** Upsert by (account, instrument, product). */
  savePosition(position: PositionRecord): Promise<void>;
  saveAccount(account: Pick<AccountRecord, 'cash' | 'realisedPnl' | 'charges'>): Promise<void>;
}

export interface PaperStore {
  /** The user's INR account, created on first use. */
  accountFor(userId: string, initialCash: number): Promise<AccountRecord>;
  inAccount<T>(accountId: string, work: (tx: PaperUnitOfWork) => Promise<T>): Promise<T>;
  orders(accountId: string, filter: { openOnly: boolean; limit: number }): Promise<OrderRecord[]>;
  orderByClientId(accountId: string, clientOrderId: string): Promise<OrderRecord | null>;
  positions(accountId: string): Promise<PositionRecord[]>;
  fills(accountId: string, limit: number): Promise<FillRecord[]>;
  /** Open orders across all accounts, for matching. */
  allOpenOrders(): Promise<OrderRecord[]>;
  ordersExpiredBy(at: number): Promise<OrderRecord[]>;
  positionsDueForSquareOff(at: number): Promise<PositionRecord[]>;
}
export const PAPER_STORE = Symbol('PAPER_STORE');
