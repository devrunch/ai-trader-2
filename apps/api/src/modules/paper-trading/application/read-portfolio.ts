import type { PaperAccount } from '@aitrader/contracts';
import { roundMoney } from '../domain/money';
import { unrealisedPnl } from '../domain/position';
import { marginInUse } from './margin-in-use';
import type { PaperDeps } from './paper-settings';
import type { PaperMarket } from './ports/paper-market';
import type { FillRecord, OrderRecord, PaperStore, PositionRecord } from './ports/paper-store';

export type MarkedPosition = PositionRecord & { lastPrice: number | null; unrealisedPnl: number | null };

/** Read-only views of a user's paper account (FR-PT-7: the agent gets these and nothing that writes). */
export class ReadPortfolio {
  constructor(private readonly store: PaperStore, private readonly market: Pick<PaperMarket, 'quote'>, private readonly deps: Pick<PaperDeps, 'settings'>) {}

  async account(userId: string): Promise<PaperAccount> {
    const account = await this.store.accountFor(userId, this.deps.settings.initialCash);
    const [positions, open] = await Promise.all([this.store.positions(account.id), this.store.orders(account.id, { openOnly: true, limit: 1000 })]);
    const used = marginInUse(positions, open);
    return { id: account.id, currency: account.currency, initialCash: account.initialCash, cash: account.cash, usedMargin: used,
      available: roundMoney(account.cash - used), realisedPnl: account.realisedPnl, charges: account.charges };
  }

  async orders(userId: string, filter: { openOnly: boolean; limit: number }): Promise<OrderRecord[]> {
    const account = await this.store.accountFor(userId, this.deps.settings.initialCash);
    return this.store.orders(account.id, filter);
  }

  async fills(userId: string, limit: number): Promise<FillRecord[]> {
    const account = await this.store.accountFor(userId, this.deps.settings.initialCash);
    return this.store.fills(account.id, limit);
  }

  /** A quote that fails leaves that position unmarked (null) instead of failing the list. */
  async positions(userId: string, signal?: AbortSignal): Promise<MarkedPosition[]> {
    const account = await this.store.accountFor(userId, this.deps.settings.initialCash);
    const positions = await this.store.positions(account.id);
    const ids = [...new Set(positions.filter(p => p.quantity !== 0).map(p => p.instrumentId))];
    const quotes = new Map(await Promise.all(ids.map(async id => [id, await this.market.quote(id, signal).catch(() => null)] as const)));
    return positions.map(p => {
      const last = quotes.get(p.instrumentId)?.price ?? null;
      return { ...p, lastPrice: last, unrealisedPnl: last === null ? null : unrealisedPnl(p, last) };
    });
  }
}
