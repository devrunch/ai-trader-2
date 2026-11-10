import type { PriceBar } from '../domain/matching';
import type { TradableInstrument } from '../domain/segment';
import type { Session } from '../domain/session-rules';
import type { PaperMarket } from './ports/paper-market';
import type { AccountRecord, FillRecord, OrderRecord, PaperStore, PaperUnitOfWork, PositionRecord } from './ports/paper-store';
import { DEFAULT_PAPER_SETTINGS, type PaperDeps } from './paper-settings';

/** 2026-11-11 10:00 IST, a Wednesday session 09:15–15:30 IST. */
export const NOW = Date.parse('2026-11-11T04:30:00Z');
export const SESSION: Session = { open: Date.parse('2026-11-11T03:45:00Z'), close: Date.parse('2026-11-11T10:00:00Z') };
export const SQUARE_OFF = Date.parse('2026-11-11T09:50:00Z');

export const INFY: TradableInstrument = { id: 'NSE:INFY', exchange: 'NSE', type: 'stock', currency: 'INR', status: 'active', lotSize: 1, tick: 0.05 };
export const NIFTY_FUT: TradableInstrument = { id: 'NSE:NIFTYZ2026', exchange: 'NSE', type: 'futures', currency: 'INR', status: 'active', lotSize: 75, tick: 0.05 };

interface State { accounts: AccountRecord[]; orders: OrderRecord[]; fills: FillRecord[]; positions: PositionRecord[] }

export class MemoryPaperStore implements PaperStore {
  state: State = { accounts: [], orders: [], fills: [], positions: [] };
  private chain = Promise.resolve();
  private next = 0;

  accountFor(userId: string, initialCash: number): Promise<AccountRecord> {
    let account = this.state.accounts.find(a => a.userId === userId);
    if (!account) {
      account = { id: `acct-${String(++this.next)}`, userId, currency: 'INR', initialCash, cash: initialCash, realisedPnl: 0, charges: 0 };
      this.state.accounts.push(account);
    }
    return Promise.resolve({ ...account });
  }

  inAccount<T>(accountId: string, work: (tx: PaperUnitOfWork) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const snapshot = structuredClone(this.state);
      try { return await work(this.unitOfWork(accountId)); }
      catch (error) { this.state = snapshot; throw error; }
    };
    const result = this.chain.then(run);
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }

  orders(accountId: string, filter: { openOnly: boolean; limit: number }): Promise<OrderRecord[]> {
    return Promise.resolve(this.state.orders.filter(o => o.accountId === accountId && (!filter.openOnly || o.status === 'open'))
      .sort((a, b) => b.placedAt - a.placedAt).slice(0, filter.limit).map(o => ({ ...o })));
  }
  orderByClientId(accountId: string, clientOrderId: string): Promise<OrderRecord | null> {
    const found = this.state.orders.find(o => o.accountId === accountId && o.clientOrderId === clientOrderId);
    return Promise.resolve(found ? { ...found } : null);
  }
  positions(accountId: string): Promise<PositionRecord[]> {
    return Promise.resolve(this.state.positions.filter(p => p.accountId === accountId).map(p => ({ ...p })));
  }
  fills(accountId: string, limit: number): Promise<FillRecord[]> {
    return Promise.resolve(this.state.fills.filter(f => f.accountId === accountId).slice(-limit).reverse().map(f => structuredClone(f)));
  }
  allOpenOrders(): Promise<OrderRecord[]> { return Promise.resolve(this.state.orders.filter(o => o.status === 'open').map(o => ({ ...o }))); }
  ordersExpiredBy(at: number): Promise<OrderRecord[]> {
    return Promise.resolve(this.state.orders.filter(o => o.status === 'open' && o.expiresAt <= at).map(o => ({ ...o })));
  }
  positionsDueForSquareOff(at: number): Promise<PositionRecord[]> {
    return Promise.resolve(this.state.positions.filter(p => p.product === 'MIS' && p.quantity !== 0 && p.squareOffAt !== null && p.squareOffAt <= at)
      .map(p => ({ ...p })));
  }

  private unitOfWork(accountId: string): PaperUnitOfWork {
    const mine = () => this.state.orders.filter(o => o.accountId === accountId);
    const account = () => {
      const found = this.state.accounts.find(a => a.id === accountId);
      if (!found) throw new Error('no account');
      return found;
    };
    return {
      account: () => Promise.resolve({ ...account() }),
      orderByClientId: id => this.orderByClientId(accountId, id),
      order: id => Promise.resolve(mine().find(o => o.id === id) ?? null).then(o => (o ? { ...o } : null)),
      openOrders: () => Promise.resolve(mine().filter(o => o.status === 'open').map(o => ({ ...o }))),
      positions: () => this.positions(accountId),
      netPnlSince: since => Promise.resolve(this.state.fills.filter(f => f.accountId === accountId && f.filledAt >= since)
        .reduce((sum, f) => sum + f.realisedPnl - f.charges.total, 0)),
      insertOrder: order => {
        if (mine().some(o => o.clientOrderId === order.clientOrderId)) return Promise.reject(new Error('unique violation'));
        this.state.orders.push({ ...order });
        return Promise.resolve();
      },
      closeOrder: (id, close, at) => {
        const order = mine().find(o => o.id === id);
        if (order?.status !== 'open') return Promise.resolve(false);
        Object.assign(order, close, { updatedAt: at });
        return Promise.resolve(true);
      },
      markTriggered: (id, at) => {
        const order = mine().find(o => o.id === id);
        if (order) Object.assign(order, { triggered: true, updatedAt: at });
        return Promise.resolve();
      },
      insertFill: fill => {
        if (this.state.fills.some(f => f.orderId === fill.orderId)) return Promise.reject(new Error('unique violation'));
        this.state.fills.push(structuredClone(fill));
        return Promise.resolve();
      },
      savePosition: position => {
        const index = this.state.positions.findIndex(p => p.accountId === accountId && p.instrumentId === position.instrumentId && p.product === position.product);
        if (index === -1) this.state.positions.push({ ...position });
        else this.state.positions[index] = { ...position, id: this.state.positions[index]?.id ?? position.id };
        return Promise.resolve();
      },
      saveAccount: patch => { Object.assign(account(), patch); return Promise.resolve(); },
    };
  }
}

export class FakeMarket implements PaperMarket {
  instruments = new Map<string, TradableInstrument>([[INFY.id, INFY], [NIFTY_FUT.id, NIFTY_FUT]]);
  quotes = new Map<string, { price: number; at: number } | null>();
  bars = new Map<string, PriceBar[]>();
  sessionWindow: Session | null = SESSION;
  watched: string[][] = [];

  instrument(id: string): Promise<TradableInstrument> {
    const found = this.instruments.get(id);
    return found ? Promise.resolve(found) : Promise.reject(new Error(`unknown ${id}`));
  }
  quote(instrumentId: string): Promise<{ price: number; at: number } | null> { return Promise.resolve(this.quotes.get(instrumentId) ?? null); }
  barsSince(instrumentId: string, since: number): Promise<PriceBar[]> {
    return Promise.resolve((this.bars.get(instrumentId) ?? []).filter(b => b.time >= since));
  }
  session(_instrumentId: string, at: number): Session | null {
    return this.sessionWindow && at >= this.sessionWindow.open && at < this.sessionWindow.close ? this.sessionWindow : null;
  }
  watch(instrumentIds: readonly string[]): Promise<void> { this.watched.push([...instrumentIds]); return Promise.resolve(); }
}

export function fakeDeps(clock: { now: number }): PaperDeps {
  let id = 0;
  return { clock: () => clock.now, ids: () => `id-${String(++id)}`, settings: { ...DEFAULT_PAPER_SETTINGS, slippageRate: 0 } };
}
