import { matchOrder } from '../domain/matching';
import { fillOrder, slippageFor, workingOrder } from './fill-order';
import type { PaperDeps } from './paper-settings';
import type { PaperMarket } from './ports/paper-market';
import type { OrderRecord, PaperStore } from './ports/paper-store';

const MINUTE = 60_000;
type Log = (message: string, detail: Record<string, unknown>) => void;

/**
 * One matching pass (FR-PT-2): every open order against the one-minute bars since it was placed. Re-running a pass is safe:
 * each fill re-reads the order inside its account lock and only an open order can fill. One instrument failing (no data,
 * provider down) doesn't stop the others; the pass then fails so the job records it.
 */
export class MatchOpenOrders {
  constructor(private readonly store: PaperStore, private readonly market: PaperMarket, private readonly deps: PaperDeps,
    private readonly log: Log = () => undefined) {}

  async execute(signal?: AbortSignal): Promise<{ filled: number; triggered: number }> {
    const byInstrument = new Map<string, OrderRecord[]>();
    for (const order of await this.store.allOpenOrders()) byInstrument.set(order.instrumentId, [...byInstrument.get(order.instrumentId) ?? [], order]);
    await this.market.watch([...byInstrument.keys()]);
    const totals = { filled: 0, triggered: 0 };
    const failed: string[] = [];
    for (const [instrumentId, orders] of byInstrument) {
      signal?.throwIfAborted();
      try {
        const result = await this.matchInstrument(instrumentId, orders, signal);
        totals.filled += result.filled;
        totals.triggered += result.triggered;
      } catch (error) {
        failed.push(instrumentId);
        this.log('paper matching failed for an instrument', { instrumentId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (failed.length) throw new Error(`Paper matching failed for ${String(failed.length)} instrument(s): ${failed.join(', ')}`);
    return totals;
  }

  private async matchInstrument(instrumentId: string, orders: OrderRecord[], signal?: AbortSignal): Promise<{ filled: number; triggered: number }> {
    const since = Math.floor(Math.min(...orders.map(o => o.placedAt)) / MINUTE) * MINUTE;
    const bars = await this.market.barsSince(instrumentId, since, signal);
    const slippageAt = await slippageFor(instrumentId, since, this.deps.clock(), this.deps);
    let filled = 0; let triggered = 0;
    for (const order of orders) {
      const result = matchOrder(workingOrder(order, slippageAt), bars.filter(b => b.time < order.expiresAt));
      if (result.kind === 'fill') {
        const done = await this.store.inAccount(order.accountId, async tx => {
          const current = await tx.order(order.id);
          return current?.status === 'open' ? fillOrder(tx, current, result, this.deps) : false;
        });
        if (done) filled++;
      } else if (result.triggered && !order.triggered) {
        await this.store.inAccount(order.accountId, tx => tx.markTriggered(order.id, this.deps.clock()));
        triggered++;
      }
    }
    return { filled, triggered };
  }
}
