import { describe, expect, it } from 'vitest';
import { ServerClock } from './server-clock';

describe('ServerClock (E14)', () => {
  it('offset uses the median and ignores an outlier', async () => {
    let local = 1_000;
    const clock = new ServerClock(() => local);
    // Server is 500 ms ahead; each round trip takes 100 ms except one 3 s outlier.
    const trips = [100, 100, 3000, 100, 100];
    for (const rtt of trips) {
      await clock.sync(() => { const serverNow = local + 500 + rtt / 2; local += rtt; return Promise.resolve(serverNow); });
    }
    expect(clock.offset()).toBe(500);
    expect(clock.now()).toBe(local + 500);
  });

  it('keeps only the last five samples', async () => {
    const local = 0;
    const clock = new ServerClock(() => local);
    for (let i = 0; i < 5; i++) await clock.sync(() => Promise.resolve(local + 10_000));
    for (let i = 0; i < 5; i++) await clock.sync(() => Promise.resolve(local + 200));
    expect(clock.offset()).toBe(200);
  });

  it('a failed sample leaves the offset unchanged', async () => {
    const clock = new ServerClock(() => 0);
    await clock.sync(() => Promise.resolve(300));
    await expect(clock.sync(() => Promise.reject(new Error('down')))).resolves.toBe(false);
    expect(clock.offset()).toBe(300);
  });
});
