import { ConflictError, NotFoundError } from '../../../shared/errors';
import { assertCancellable, OrderStateError } from '../domain/order';
import type { PaperDeps } from './paper-settings';
import type { InCurrency, OrderRecord, PaperStore } from './ports/paper-store';

export class CancelOrder {
  constructor(private readonly store: PaperStore, private readonly deps: Pick<PaperDeps, 'clock'>) {}

  async execute(userId: string, orderId: string): Promise<InCurrency<OrderRecord>> {
    const account = await this.store.orderAccount(userId, orderId);
    if (!account) throw new NotFoundError('Order not found', { orderId });
    const order = await this.store.inAccount(account.id, async tx => {
      const found = await tx.order(orderId);
      if (!found) throw new NotFoundError('Order not found', { orderId });
      try { assertCancellable(found.status); }
      catch (error) {
        if (error instanceof OrderStateError) throw new ConflictError(error.message, { orderId, status: error.status });
        throw error;
      }
      await tx.closeOrder(orderId, { status: 'cancelled', closeReason: 'USER' }, this.deps.clock());
      return (await tx.order(orderId)) ?? found;
    });
    return { ...order, currency: account.currency };
  }
}
