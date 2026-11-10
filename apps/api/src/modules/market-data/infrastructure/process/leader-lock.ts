import type { Redis } from 'ioredis';
import { backoffDelay, sleep } from '@aitrader/resilience';

const renewScript = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";
const releaseScript = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
// Leadership survives transient Redis errors while the lease is known valid; it ends when Redis names
// another holder or the lease has run out without a successful renew (live finding 2026-11-10).
const SAFETY_MS = 1000;
export class LeaderLock {
  private readonly ttlMs: number;
  private readonly renewMs: number;
  private readonly clock: () => number;
  private leader = false;
  private validUntil = -Infinity;
  constructor(private readonly redis: Redis, private readonly instanceId: string,
    opts: { ttlMs?: number; renewMs?: number; clock?: () => number } = {}) {
    this.ttlMs = opts.ttlMs ?? 10000; this.renewMs = opts.renewMs ?? 3000; this.clock = opts.clock ?? Date.now;
  }
  /** Local fence: true while this instance's lease is certainly still valid. No Redis call. */
  holdsLease(): boolean { return this.leader && this.clock() < this.validUntil; }

  async acquireLoop(signal: AbortSignal, onAcquired: () => Promise<void>, onLost: () => Promise<void>): Promise<void> {
    let failures = 0;
    while (!signal.aborted) {
      const sentAt = this.clock();
      try {
        if (this.leader) {
          const renewed = await this.redis.eval(renewScript, 1, 'md:leader', this.instanceId, String(this.ttlMs));
          if (renewed === 1) this.validUntil = sentAt + this.ttlMs - SAFETY_MS;
          else await this.lose(onLost);
        } else {
          const result = await this.redis.set('md:leader', this.instanceId, 'PX', this.ttlMs, 'NX');
          if (result === 'OK') { this.leader = true; this.validUntil = sentAt + this.ttlMs - SAFETY_MS; await onAcquired(); }
        }
        failures = 0;
      } catch {
        if (this.leader && this.clock() >= this.validUntil) await this.lose(onLost);
        if (!(await this.wait(backoffDelay(failures++, { baseMs: 100, maxMs: this.renewMs }), signal))) return;
        continue;
      }
      if (!(await this.wait(this.renewMs, signal))) return;
    }
  }
  private async lose(onLost: () => Promise<void>): Promise<void> {
    this.leader = false; this.validUntil = -Infinity;
    await onLost();
  }
  private async wait(ms: number, signal: AbortSignal): Promise<boolean> {
    try { await sleep(ms, signal); return true; }
    catch (error) { if (signal.aborted) return false; throw error; }
  }
  async release(): Promise<void> { await this.redis.eval(releaseScript, 1, 'md:leader', this.instanceId); }
}
