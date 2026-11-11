import type { PaperAccount } from '@aitrader/contracts';
import { accountTermsFor } from '../domain/currency';
import { roundMoney } from '../domain/money';
import { unrealisedPnl } from '../domain/position';
import { marginInUse } from './margin-in-use';
import type { PaperDeps } from './paper-settings';
import type { PaperMarket } from './ports/paper-market';
import type { AccountRecord, FillRecord, InCurrency, OrderRecord, PaperStore, PositionRecord } from './ports/paper-store';

export type MarkedPosition = InCurrency<PositionRecord> & { lastPrice: number | null; unrealisedPnl: number | null };

/**
 * Read-only views of a user's paper accounts, one per currency (FR-PT-7: the agent gets these and nothing that writes).
 * Lists span every account, each row tagged with its account's currency.
 */
export class ReadPortfolio {
  constructor(private readonly store: PaperStore, private readonly market: Pick<PaperMarket, 'quote' | 'instrument'>, private readonly deps: Pick<PaperDeps, 'settings'>) {}

  /** The rupee account always exists; others appear on their first order. */
  async accounts(userId: string): Promise<PaperAccount[]> {
    const accounts = await this.store.accounts(userId);
    const all = accounts.some(a => a.currency === 'INR') ? accounts : [await this.open(userId, 'INR'), ...accounts];
    return Promise.all(all.map(a => this.summary(a)));
  }

  async account(userId: string, currency = 'INR'): Promise<PaperAccount> {
    return this.summary(await this.open(userId, currency));
  }

  /** The account an order in this instrument settles in. */
  async accountForInstrument(userId: string, instrumentId: string): Promise<PaperAccount> {
    return this.account(userId, (await this.market.instrument(instrumentId)).currency);
  }

  async orders(userId: string, filter: { openOnly: boolean; limit: number }): Promise<InCurrency<OrderRecord>[]> {
    const rows = await this.each(userId, a => this.store.orders(a.id, filter));
    return rows.sort((x, y) => y.placedAt - x.placedAt).slice(0, filter.limit);
  }

  async fills(userId: string, limit: number): Promise<InCurrency<FillRecord>[]> {
    const rows = await this.each(userId, a => this.store.fills(a.id, limit));
    return rows.sort((x, y) => y.filledAt - x.filledAt).slice(0, limit);
  }

  /** A quote that fails leaves that position unmarked (null) instead of failing the list. */
  async positions(userId: string, signal?: AbortSignal): Promise<MarkedPosition[]> {
    const positions = await this.each(userId, a => this.store.positions(a.id));
    const ids = [...new Set(positions.filter(p => p.quantity !== 0).map(p => p.instrumentId))];
    const quotes = new Map(await Promise.all(ids.map(async id => [id, await this.market.quote(id, signal).catch(() => null)] as const)));
    return positions.map(p => {
      const last = quotes.get(p.instrumentId)?.price ?? null;
      return { ...p, lastPrice: last, unrealisedPnl: last === null ? null : unrealisedPnl(p, last) };
    });
  }

  private open(userId: string, currency: string): Promise<AccountRecord> {
    return this.store.accountFor(userId, currency, accountTermsFor(currency, this.deps.settings).initialCash);
  }

  private async each<T>(userId: string, read: (account: AccountRecord) => Promise<T[]>): Promise<InCurrency<T>[]> {
    const accounts = await this.store.accounts(userId);
    return (await Promise.all(accounts.map(async a => (await read(a)).map(row => ({ ...row, currency: a.currency }))))).flat();
  }

  private async summary(account: AccountRecord): Promise<PaperAccount> {
    const [positions, open] = await Promise.all([this.store.positions(account.id), this.store.orders(account.id, { openOnly: true, limit: 1000 })]);
    const used = marginInUse(positions, open);
    return { id: account.id, currency: account.currency, initialCash: account.initialCash, cash: account.cash, usedMargin: used,
      available: roundMoney(account.cash - used), realisedPnl: account.realisedPnl, charges: account.charges };
  }
}
