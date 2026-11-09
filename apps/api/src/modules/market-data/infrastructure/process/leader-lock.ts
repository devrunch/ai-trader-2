import type { Redis } from 'ioredis';
import { backoffDelay, sleep } from '@aitrader/resilience';

const renewScript = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";
const releaseScript = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
export class LeaderLock {
  private readonly ttlMs: number;
  private readonly renewMs: number;
  constructor(private readonly redis: Redis, private readonly instanceId: string,
    opts: { ttlMs?: number; renewMs?: number; clock?: () => number } = {}) {
    this.ttlMs = opts.ttlMs ?? 10000; this.renewMs = opts.renewMs ?? 3000;
  }
  async acquireLoop(signal: AbortSignal, onAcquired: () => Promise<void>, onLost: () => Promise<void>): Promise<void> {
    let leader = false; let failures = 0;
    while (!signal.aborted) {
      try {
        if (leader) {
          const renewed = await this.redis.eval(renewScript, 1, 'md:leader', this.instanceId, String(this.ttlMs));
          if (renewed !== 1) { leader = false; await onLost(); }
        } else {
          const result = await this.redis.set('md:leader', this.instanceId, 'PX', this.ttlMs, 'NX');
          if (result === 'OK') { leader = true; failures = 0; await onAcquired(); }
        }
        failures = 0;
      } catch {
        if (leader) { leader = false; await onLost(); }
        if (!(await this.wait(backoffDelay(failures++, { baseMs: 100, maxMs: this.renewMs }), signal))) return;
        continue;
      }
      if (!(await this.wait(this.renewMs, signal))) return;
    }
  }
  private async wait(ms: number, signal: AbortSignal): Promise<boolean> {
    try { await sleep(ms, signal); return true; }
    catch (error) { if (signal.aborted) return false; throw error; }
  }
  async release(): Promise<void> { await this.redis.eval(releaseScript, 1, 'md:leader', this.instanceId); }
}
