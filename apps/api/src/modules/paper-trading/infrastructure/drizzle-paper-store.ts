import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import type { Database } from '../../../shared/database';
import { paperAccounts, paperFills, paperOrders, paperPositions } from '../../../shared/database/schema';
import type {
  AccountRecord, FillRecord, OrderClose, OrderRecord, PaperStore, PaperUnitOfWork, PositionRecord,
} from '../application/ports/paper-store';

type Executor = Pick<Database, 'select' | 'insert' | 'update'>;
type AccountRow = typeof paperAccounts.$inferSelect;
type OrderRow = typeof paperOrders.$inferSelect;
type FillRow = typeof paperFills.$inferSelect;
type PositionRow = typeof paperPositions.$inferSelect;

/**
 * Paper trading on PostgreSQL. Every write runs in a transaction that first locks the account row, so placements,
 * fills and square-offs for one account are serialised; idempotency rests on `paper_orders (account_id, client_order_id)`,
 * the `status = 'open'` guard on every close, and `paper_fills (order_id)`. Statement timeouts come from the pool.
 */
export class DrizzlePaperStore implements PaperStore {
  constructor(private readonly db: Database) {}

  async accountFor(userId: string, initialCash: number): Promise<AccountRecord> {
    await this.db.insert(paperAccounts).values({ userId, currency: 'INR', initialCash, cash: initialCash })
      .onConflictDoNothing({ target: [paperAccounts.userId, paperAccounts.currency] });
    const [row] = await this.db.select().from(paperAccounts).where(and(eq(paperAccounts.userId, userId), eq(paperAccounts.currency, 'INR')));
    if (!row) throw new Error('Paper account was not created');
    return toAccount(row);
  }

  inAccount<T>(accountId: string, work: (tx: PaperUnitOfWork) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      const locked = await tx.select({ id: paperAccounts.id }).from(paperAccounts).where(eq(paperAccounts.id, accountId)).for('update');
      if (!locked.length) throw new Error('Paper account not found');
      return work(new DrizzleUnitOfWork(tx, accountId));
    });
  }

  async orders(accountId: string, filter: { openOnly: boolean; limit: number }): Promise<OrderRecord[]> {
    const where = filter.openOnly ? and(eq(paperOrders.accountId, accountId), eq(paperOrders.status, 'open')) : eq(paperOrders.accountId, accountId);
    const rows = await this.db.select().from(paperOrders).where(where).orderBy(desc(paperOrders.placedAt), desc(paperOrders.id)).limit(filter.limit);
    return rows.map(toOrder);
  }

  async orderByClientId(accountId: string, clientOrderId: string): Promise<OrderRecord | null> {
    return findByClientId(this.db, accountId, clientOrderId);
  }

  async positions(accountId: string): Promise<PositionRecord[]> {
    return (await this.db.select().from(paperPositions).where(eq(paperPositions.accountId, accountId)).orderBy(asc(paperPositions.instrumentId))).map(toPosition);
  }

  async fills(accountId: string, limit: number): Promise<FillRecord[]> {
    const rows = await this.db.select().from(paperFills).where(eq(paperFills.accountId, accountId)).orderBy(desc(paperFills.filledAt)).limit(limit);
    return rows.map(toFill);
  }

  async allOpenOrders(): Promise<OrderRecord[]> {
    return (await this.db.select().from(paperOrders).where(eq(paperOrders.status, 'open')).orderBy(asc(paperOrders.placedAt))).map(toOrder);
  }

  async ordersExpiredBy(at: number): Promise<OrderRecord[]> {
    const rows = await this.db.select().from(paperOrders).where(and(eq(paperOrders.status, 'open'), lte(paperOrders.expiresAt, new Date(at))));
    return rows.map(toOrder);
  }

  async positionsDueForSquareOff(at: number): Promise<PositionRecord[]> {
    const rows = await this.db.select().from(paperPositions)
      .where(and(eq(paperPositions.product, 'MIS'), ne(paperPositions.quantity, 0), lte(paperPositions.squareOffAt, new Date(at))));
    return rows.map(toPosition);
  }
}

class DrizzleUnitOfWork implements PaperUnitOfWork {
  constructor(private readonly tx: Executor, private readonly accountId: string) {}

  async account(): Promise<AccountRecord> {
    const [row] = await this.tx.select().from(paperAccounts).where(eq(paperAccounts.id, this.accountId));
    if (!row) throw new Error('Paper account not found');
    return toAccount(row);
  }

  orderByClientId(clientOrderId: string): Promise<OrderRecord | null> { return findByClientId(this.tx, this.accountId, clientOrderId); }

  async order(id: string): Promise<OrderRecord | null> {
    const [row] = await this.tx.select().from(paperOrders).where(and(eq(paperOrders.id, id), eq(paperOrders.accountId, this.accountId)));
    return row ? toOrder(row) : null;
  }

  async openOrders(): Promise<OrderRecord[]> {
    const rows = await this.tx.select().from(paperOrders).where(and(eq(paperOrders.accountId, this.accountId), eq(paperOrders.status, 'open')))
      .orderBy(asc(paperOrders.placedAt), asc(paperOrders.clientOrderId));
    return rows.map(toOrder);
  }

  async positions(): Promise<PositionRecord[]> {
    return (await this.tx.select().from(paperPositions).where(eq(paperPositions.accountId, this.accountId))).map(toPosition);
  }

  async netPnlSince(since: number): Promise<number> {
    const [row] = await this.tx.select({ net: sql<string>`coalesce(sum(${paperFills.realisedPnl} - ${paperFills.totalCharges}), 0)` })
      .from(paperFills).where(and(eq(paperFills.accountId, this.accountId), gte(paperFills.filledAt, new Date(since))));
    return Number(row?.net ?? 0);
  }

  async insertOrder(order: OrderRecord): Promise<void> { await this.tx.insert(paperOrders).values(orderValues(order)); }

  async closeOrder(id: string, close: OrderClose, at: number): Promise<boolean> {
    const patch = close.status === 'filled'
      ? { status: close.status, fillPrice: close.fillPrice, filledAt: new Date(close.filledAt) }
      : { status: close.status, closeReason: close.closeReason };
    const rows = await this.tx.update(paperOrders).set({ ...patch, updatedAt: new Date(at) })
      .where(and(eq(paperOrders.id, id), eq(paperOrders.accountId, this.accountId), eq(paperOrders.status, 'open'))).returning({ id: paperOrders.id });
    return rows.length === 1;
  }

  async markTriggered(id: string, at: number): Promise<void> {
    await this.tx.update(paperOrders).set({ triggered: true, updatedAt: new Date(at) })
      .where(and(eq(paperOrders.id, id), eq(paperOrders.accountId, this.accountId), eq(paperOrders.status, 'open')));
  }

  async insertFill(fill: FillRecord): Promise<void> {
    const { charges } = fill;
    await this.tx.insert(paperFills).values({
      id: fill.id, orderId: fill.orderId, accountId: fill.accountId, instrumentId: fill.instrumentId, side: fill.side, product: fill.product,
      quantity: fill.quantity, price: fill.price, slippage: fill.slippage, brokerage: charges.brokerage, stt: charges.stt,
      exchangeCharges: charges.exchange, sebi: charges.sebi, stamp: charges.stamp, gst: charges.gst, totalCharges: charges.total,
      realisedPnl: fill.realisedPnl, filledAt: new Date(fill.filledAt),
    });
  }

  async savePosition(position: PositionRecord): Promise<void> {
    const values = { ...position, squareOffAt: date(position.squareOffAt), updatedAt: new Date(position.updatedAt) };
    await this.tx.insert(paperPositions).values(values).onConflictDoUpdate({
      target: [paperPositions.accountId, paperPositions.instrumentId, paperPositions.product],
      set: { quantity: values.quantity, averagePrice: values.averagePrice, realisedPnl: values.realisedPnl, squareOffAt: values.squareOffAt, updatedAt: values.updatedAt },
    });
  }

  async saveAccount(account: Pick<AccountRecord, 'cash' | 'realisedPnl' | 'charges'>): Promise<void> {
    await this.tx.update(paperAccounts).set({ ...account, updatedAt: new Date() }).where(eq(paperAccounts.id, this.accountId));
  }
}

async function findByClientId(db: Executor, accountId: string, clientOrderId: string): Promise<OrderRecord | null> {
  const [row] = await db.select().from(paperOrders).where(and(eq(paperOrders.accountId, accountId), eq(paperOrders.clientOrderId, clientOrderId)));
  return row ? toOrder(row) : null;
}

const date = (value: number | null): Date | null => (value === null ? null : new Date(value));
const ms = (value: Date | null): number | null => (value === null ? null : value.getTime());

function toAccount(row: AccountRow): AccountRecord {
  return { id: row.id, userId: row.userId, currency: row.currency, initialCash: row.initialCash, cash: row.cash, realisedPnl: row.realisedPnl, charges: row.charges };
}

function toOrder(row: OrderRow): OrderRecord {
  return { ...row, placedAt: row.placedAt.getTime(), expiresAt: row.expiresAt.getTime(), filledAt: ms(row.filledAt), updatedAt: row.updatedAt.getTime() };
}

function orderValues(order: OrderRecord): typeof paperOrders.$inferInsert {
  return { ...order, placedAt: new Date(order.placedAt), expiresAt: new Date(order.expiresAt), filledAt: date(order.filledAt), updatedAt: new Date(order.updatedAt) };
}

function toFill(row: FillRow): FillRecord {
  return { id: row.id, orderId: row.orderId, accountId: row.accountId, instrumentId: row.instrumentId, side: row.side, product: row.product,
    quantity: row.quantity, price: row.price, slippage: row.slippage, realisedPnl: row.realisedPnl, filledAt: row.filledAt.getTime(),
    charges: { brokerage: row.brokerage, stt: row.stt, exchange: row.exchangeCharges, sebi: row.sebi, stamp: row.stamp, gst: row.gst, total: row.totalCharges } };
}

function toPosition(row: PositionRow): PositionRecord {
  return { ...row, squareOffAt: ms(row.squareOffAt), updatedAt: row.updatedAt.getTime() };
}
