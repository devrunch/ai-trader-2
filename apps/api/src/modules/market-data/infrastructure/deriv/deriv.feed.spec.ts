import { afterEach, describe, expect, it, vi } from 'vitest';
import { DerivFeed } from './deriv.feed';
import { DerivWsClient } from './deriv-ws.client';
import { historyFixture } from '../../application/history.spec-helper';

describe('FR-MD-1 E6 Deriv feed breaker', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  it('reports PROVIDER_DOWN immediately while its connection breaker is open', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const connect = vi.spyOn(DerivWsClient.prototype, 'connect').mockRejectedValue(new Error('PROVIDER_DOWN'));
    const f = historyFixture(); const reasons: string[] = [];
    const feed = new DerivFeed({ instruments: f.instruments, store: f.store,
      fill: { execute: () => Promise.resolve({ ok: false, reason: 'NO_DATA' }) }, log: vi.fn() });
    feed.onState((state, reason) => { if (state === 'reconnecting' && reason) reasons.push(reason); });
    const started = feed.start();
    try {
      await vi.advanceTimersByTimeAsync(15000);
      expect(connect).toHaveBeenCalledTimes(3);
      expect(reasons.length).toBeGreaterThanOrEqual(4);
      expect(new Set(reasons)).toEqual(new Set(['PROVIDER_DOWN']));
    } finally { await feed.stop(); await started; }
  });
});
