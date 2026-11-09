import { expect, it, vi } from 'vitest';
import { GetFeedOverview } from './get-feed-overview';

it('combines feed state with leadership for the admin view (FR-AC-2)', async () => {
  const overview = new GetFeedOverview({ get: vi.fn().mockResolvedValue({ state: 'live', at: 1 }) },
    { leader: vi.fn().mockResolvedValue({ instanceId: 'md-1', ttlMs: 5 }), subscriptions: vi.fn().mockResolvedValue([{ instrumentId: 'NSE:A', count: 1 }]) });
  expect(await overview.state('kite')).toEqual({ state: 'live', at: 1 });
  expect(await overview.leader()).toEqual({ instanceId: 'md-1', ttlMs: 5 });
  expect(await overview.subscriptions()).toEqual([{ instrumentId: 'NSE:A', count: 1 }]);
});
