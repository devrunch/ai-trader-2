import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobScheduler } from '../../../shared/jobs';
import type { BackfillHeld } from '../application/backfill-held';
import { BackfillJob } from './backfill.job';

describe('FR-MD-2 E4 bars backfill scheduling', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it('registers the IST nightly job with grace and runtime limits', async () => {
    const register = vi.fn<JobScheduler['register']>().mockResolvedValue(undefined);
    const execute = vi.fn<BackfillHeld['execute']>().mockResolvedValue({});
    await new BackfillJob({ register }, { execute }).onApplicationBootstrap();
    const spec = register.mock.calls[0]?.[0];
    expect(spec).toMatchObject({ name: 'bars-backfill', cron: '30 0 * * *', tz: 'Asia/Kolkata', graceMs: 21600000, maxRuntimeMs: 2700000 });
    if (!spec) throw new Error('Missing job');
    const signal = new AbortController().signal;
    await spec.run(signal); expect(execute).toHaveBeenCalledExactlyOnceWith(signal);
  });
  it('waits at least one second before retrying a rate-limited run', async () => {
    vi.useFakeTimers(); vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const register = vi.fn<JobScheduler['register']>().mockResolvedValue(undefined);
    const execute = vi.fn<BackfillHeld['execute']>().mockResolvedValue({})
      .mockResolvedValueOnce({ 'NSE:TEST': { ok: false, reason: 'RATE_LIMITED', retryAfterMs: 1000 } });
    await new BackfillJob({ register }, { execute }).onApplicationBootstrap();
    const spec = register.mock.calls[0]?.[0]; if (!spec) throw new Error('Missing job');
    const running = spec.run(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(999); expect(execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await running; expect(execute).toHaveBeenCalledTimes(2);
  });
  it('logs registration failures without breaking startup', async () => {
    const warning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    await new BackfillJob({ register: () => Promise.reject(new Error('Redis down')) }, { execute: () => Promise.resolve({}) }).onApplicationBootstrap();
    expect(warning).toHaveBeenCalledWith('Unable to register bars-backfill');
  });
  it('retries failed live-feed repairs on the nightly run (E1)', async () => {
    const register = vi.fn<JobScheduler['register']>().mockResolvedValue(undefined);
    const repairs = vi.fn<(signal: AbortSignal) => Promise<void>>().mockResolvedValue(undefined);
    await new BackfillJob({ register }, { execute: () => Promise.resolve({}) }, repairs).onApplicationBootstrap();
    const spec = register.mock.calls[0]?.[0]; if (!spec) throw new Error('Missing job');
    const signal = new AbortController().signal; await spec.run(signal);
    expect(repairs).toHaveBeenCalledExactlyOnceWith(signal);
  });
});
