import { describe, expect, it, vi } from 'vitest';
import { RequestSubscription } from './request-subscription';

describe('RequestSubscription leases (FR-LS-4, E24)', () => {
  it('two tabs on one instance acquire once and release once', async () => {
    const leases = { add: vi.fn(), remove: vi.fn(), removeAll: vi.fn() };
    const requests = new RequestSubscription(leases);
    await requests.acquire('NSE:TEST'); await requests.acquire('NSE:TEST');
    await requests.release('NSE:TEST'); await requests.release('NSE:TEST');
    expect(leases.add).toHaveBeenCalledTimes(1); expect(leases.remove).toHaveBeenCalledTimes(1);
  });

  it('releasing at zero does nothing', async () => {
    const leases = { add: vi.fn(), remove: vi.fn(), removeAll: vi.fn() };
    await new RequestSubscription(leases).release('NSE:TEST');
    expect(leases.remove).not.toHaveBeenCalled();
  });

});
