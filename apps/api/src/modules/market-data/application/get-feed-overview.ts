import type { FeedLeadership } from './ports/feed-leadership';
import type { FeedStateRecord, FeedStateStore, FeedVendor } from './ports/feed-state-store';

/** Feed health for the admin view (FR-AC-2). */
export class GetFeedOverview {
  constructor(private readonly states: FeedStateStore, private readonly leadership: FeedLeadership) {}
  state(vendor: FeedVendor): Promise<FeedStateRecord> { return this.states.get(vendor); }
  leader(): Promise<{ instanceId: string; ttlMs: number } | null> { return this.leadership.leader(); }
  subscriptions(): Promise<Array<{ instrumentId: string; count: number }>> { return this.leadership.subscriptions(); }
}
