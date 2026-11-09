// Written by the market-data process (leader lease, subscription leases); read for the admin view.
export interface FeedLeadership {
  leader(signal?: AbortSignal): Promise<{ instanceId: string; ttlMs: number } | null>;
  subscriptions(signal?: AbortSignal): Promise<Array<{ instrumentId: string; count: number }>>;
}
