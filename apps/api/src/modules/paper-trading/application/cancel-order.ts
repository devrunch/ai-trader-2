import { ConflictError, NotFoundError } from '../../../shared/errors';
import { assertCancellable, OrderStateError } from '../domain/order';
import type { PaperDeps } from './paper-settings';
import type { OrderRecord, PaperStore } from './ports/paper-store';

export class CancelOrder {
  constructor(private readonly store: PaperStore, private readonly deps: Pick<PaperDeps, 'clock' | 'settings'>) {}

  async execute(userId: string, orderId: string): Promise<OrderRecord> {
    const account = await this.store.accountFor(userId, this.deps.settings.initialCash);
    return this.store.inAccount(account.id, async tx => {
      const order = await tx.order(orderId);
      if (!order) throw new NotFoundError('Order not found', { orderId });
      try { assertCancellable(order.status); }
      catch (error) {
        if (error instanceof OrderStateError) throw new ConflictError(error.message, { orderId, status: error.status });
        throw error;
      }
      await tx.closeOrder(orderId, { status: 'cancelled', closeReason: 'USER' }, this.deps.clock());
      return (await tx.order(orderId)) ?? order;
    });
  }
}
