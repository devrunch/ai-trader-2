import type { SubscriptionLeases } from './ports/subscription-leases';

export class RequestSubscription {
  private readonly references = new Map<string, number>();
  constructor(private readonly leases: SubscriptionLeases) {}
  async acquire(instrumentId: string): Promise<void> {
    const count = this.references.get(instrumentId) ?? 0;
    this.references.set(instrumentId, count + 1);
    if (count === 0) {
      try { await this.leases.add(instrumentId); }
      catch (error) { this.references.delete(instrumentId); throw error; }
    }
  }
  async release(instrumentId: string): Promise<void> {
    const count = this.references.get(instrumentId) ?? 0;
    if (count === 0) return;
    if (count > 1) { this.references.set(instrumentId, count - 1); return; }
    this.references.delete(instrumentId);
    await this.leases.remove(instrumentId);
  }
}
