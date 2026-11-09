import { afterEach, describe, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import { LeaderLock } from './leader-lock';

describe('LeaderLock (SRD §10.5, E25)', () => {
  const clients: Redis[] = [];
  afterEach(() => { for (const client of clients.splice(0)) client.disconnect(); vi.restoreAllMocks(); });
  function fakeRedis(): Redis { const client = new Redis('redis://127.0.0.1:1', { lazyConnect: true }); clients.push(client); return client; }
  it('acquires when free and renews', async () => {
    const redis = fakeRedis(); const set = vi.spyOn(redis, 'set').mockResolvedValue('OK');
    const evalScript = vi.spyOn(redis, 'eval').mockResolvedValue(1); const controller = new AbortController();
    let acquired = 0; const loop = new LeaderLock(redis, 'one', { renewMs: 2 }).acquireLoop(controller.signal, () => { acquired++; return Promise.resolve(); }, () => Promise.resolve());
    await new Promise(resolve => setTimeout(resolve, 15)); controller.abort(); await loop;
    expect(acquired).toBe(1); expect(set).toHaveBeenCalledWith('md:leader', 'one', 'PX', 10000, 'NX'); expect(evalScript).toHaveBeenCalled();
  });
  it('does not acquire when held by another', async () => {
    const redis = fakeRedis(); const set = vi.spyOn(redis, 'set');
    const controller = new AbortController(); controller.abort();
    await new LeaderLock(redis, 'two', { renewMs: 2 }).acquireLoop(controller.signal, () => Promise.resolve(), () => Promise.resolve());
    expect(set).not.toHaveBeenCalled();
  });
  it('fires onLost when renew fails', async () => {
    const redis = fakeRedis(); vi.spyOn(redis, 'set').mockResolvedValue('OK'); vi.spyOn(redis, 'eval').mockResolvedValueOnce(0);
    const controller = new AbortController(); let lost = 0;
    const loop = new LeaderLock(redis, 'one', { renewMs: 2 }).acquireLoop(controller.signal, () => Promise.resolve(), () => { lost++; controller.abort(); return Promise.resolve(); });
    await loop; expect(lost).toBe(1);
  });
  it('release deletes only its own lock', async () => {
    const redis = fakeRedis(); const evalScript = vi.spyOn(redis, 'eval').mockResolvedValue(0);
    await new LeaderLock(redis, 'one').release();
    expect(evalScript).toHaveBeenCalledWith(expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"), 1, 'md:leader', 'one');
  });
});
