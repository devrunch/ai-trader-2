import type { SecondInterval } from '../domain/interval';
import type { SecondsLeases } from './ports/seconds-store';
import type { SubscriptionLeases } from './ports/subscription-leases';

export class RequestSubscription {
  private readonly references = new Map<string, number>();
  private readonly secondRefs = new Map<string, number>();
  constructor(private readonly leases: SubscriptionLeases, private readonly seconds?: SecondsLeases) {}
  /** Seconds bars are built only while a client watches that instrument at that interval. */
  async acquireSeconds(instrumentId: string, interval: SecondInterval): Promise<void> {
    const key = `${instrumentId}|${interval}`;
    const count = this.secondRefs.get(key) ?? 0;
    this.secondRefs.set(key, count + 1);
    if (count > 0) return;
    try { await this.seconds?.add(instrumentId, interval); }
    catch (error) { this.secondRefs.delete(key); throw error; }
  }
  async releaseSeconds(instrumentId: string, interval: SecondInterval): Promise<void> {
    const key = `${instrumentId}|${interval}`;
    const count = this.secondRefs.get(key) ?? 0;
    if (count > 1) { this.secondRefs.set(key, count - 1); return; }
    if (count === 0) return;
    this.secondRefs.delete(key);
    await this.seconds?.remove(instrumentId, interval);
  }
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
