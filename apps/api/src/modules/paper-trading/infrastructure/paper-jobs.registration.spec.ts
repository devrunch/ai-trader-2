import { describe, expect, it, vi } from 'vitest';
import type { JobSpec } from '../../../shared/jobs';
import { PaperJobsRegistration } from './paper-jobs.registration';

describe('paper jobs FR-PT-5, NFR-RB-5', () => {
  it('registers matching every 5 seconds and the square-off every minute, in IST, and runs the use cases', async () => {
    const specs: JobSpec[] = [];
    const match = { execute: vi.fn().mockResolvedValue({ filled: 0, triggered: 0 }) };
    const squareOff = { execute: vi.fn().mockResolvedValue({ expired: 0, squaredOff: 0 }) };
    await new PaperJobsRegistration({ register: spec => { specs.push(spec); return Promise.resolve(); } }, match, squareOff).onApplicationBootstrap();
    expect(specs.map(({ name, cron, tz }) => ({ name, cron, tz }))).toEqual([
      { name: 'paper-match', cron: '*/5 * * * * *', tz: 'Asia/Kolkata' },
      { name: 'paper-square-off', cron: '* * * * *', tz: 'Asia/Kolkata' },
    ]);
    const signal = new AbortController().signal;
    await specs[0]?.run(signal);
    await specs[1]?.run(signal);
    expect(match.execute).toHaveBeenCalledWith(signal);
    expect(squareOff.execute).toHaveBeenCalledWith(signal);
  });

  it('does not stop the application when scheduling fails', async () => {
    await expect(new PaperJobsRegistration({ register: () => Promise.reject(new Error('redis down')) },
      { execute: vi.fn() }, { execute: vi.fn() }).onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
