import type { ProviderReason } from '@aitrader/contracts';
import { z } from 'zod';
import type { LiveBars } from '../../application/live-bars';
import type { LiveFeed, FeedState } from '../../application/ports/live-feed';
import type { FeedVendor } from '../../application/ports/feed-state-store';
import { vendorFor } from '../../application/vendor-for';
import type { FeedStatePublisher } from './feed-state.publisher';
import type { SubscriptionRequests } from './subscription-requests';

export class FeedSupervisor {
  private readonly detach: Array<() => void> = [];
  private readonly counts = new Map<string, number>();
  private readonly heldIds = new Set<string>();
  private readonly subscribed = new Set<string>();
  private readonly states = new Map<FeedVendor, { state: FeedState; reason?: string }>();
  private started = false;
  private refresh: ReturnType<typeof setInterval> | undefined;
  constructor(private readonly deps: { feeds: LiveFeed[]; liveBars: Pick<LiveBars, 'attach' | 'closeDue'>; publisher: Pick<FeedStatePublisher, 'publish'>;
    requests: Pick<SubscriptionRequests, 'current' | 'onChange'>;
    held?: () => Promise<readonly string[]>; clock?: () => number; log?: (message: string) => void }) {}
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    for (const feed of this.deps.feeds) {
      this.detach.push(this.deps.liveBars.attach(feed));
      this.detach.push(feed.onState((state, reason) => {
        this.states.set(feed.name, reason === undefined ? { state } : { state, reason });
        void this.publish(feed.name, state, reason);
      }));
    }
    this.detach.push(this.deps.requests.onChange((id, count) => { void this.applyRequest(id, count); }));
    for (const feed of this.deps.feeds) void feed.start().catch((error: unknown) => {
      this.deps.log?.(`Feed start failed for ${feed.name}: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
    let held: readonly string[] = [];
    try { held = await this.deps.held?.() ?? []; }
    catch { this.deps.log?.('Popular instruments unavailable; continuing without held subscriptions'); }
    for (const id of held) this.heldIds.add(id);
    for (const [id, count] of await this.deps.requests.current()) this.counts.set(id, count);
    for (const id of new Set([...this.heldIds, ...this.counts.keys()])) await this.updateSubscription(id);
    this.refresh = setInterval(() => {
      for (const feed of this.deps.feeds) {
        const current = this.states.get(feed.name) ?? { state: 'connecting' as const };
        void this.publish(feed.name, current.state, current.reason);
      }
    }, 20000);
  }
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false; clearInterval(this.refresh);
    await this.deps.liveBars.closeDue(this.deps.clock?.() ?? Date.now());
    for (const feed of this.deps.feeds) await feed.stop();
    for (const feed of this.deps.feeds) await this.publish(feed.name, 'stopped');
    for (const detach of this.detach.splice(0)) detach();
  }
  private async applyRequest(id: string, count: number): Promise<void> {
    this.counts.set(id, count);
    await this.updateSubscription(id);
  }
  private async updateSubscription(id: string): Promise<void> {
    const shouldSubscribe = this.heldIds.has(id) || (this.counts.get(id) ?? 0) > 0;
    const isSubscribed = this.subscribed.has(id);
    if (shouldSubscribe === isSubscribed) return;
    const vendor = vendorFor(id); const feed = this.deps.feeds.find(value => value.name === vendor);
    if (!feed) return;
    try {
      if (shouldSubscribe) { await feed.subscribe([id]); this.subscribed.add(id); }
      else { await feed.unsubscribe([id]); this.subscribed.delete(id); }
    } catch (error) {
      this.deps.log?.(`Subscription update failed for ${id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  private async publish(vendor: FeedVendor, state: FeedState, reason?: string): Promise<void> {
    const reasonSchema = z.enum(['NO_DATA', 'MARKET_CLOSED', 'UNSUPPORTED', 'RATE_LIMITED', 'PROVIDER_DOWN', 'AUTH_EXPIRED']);
    const parsed = reasonSchema.safeParse(reason);
    const typedReason: ProviderReason | undefined = parsed.success ? parsed.data : undefined;
    try { await this.deps.publisher.publish(vendor, state, typedReason); }
    catch (error) { this.deps.log?.(`Feed state publish failed for ${vendor}: ${error instanceof Error ? error.message : 'unknown error'}`); }
  }
}
