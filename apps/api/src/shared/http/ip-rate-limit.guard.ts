import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { TokenBucket } from '@aitrader/resilience';
import { RateLimitedError } from '../errors';

// One token bucket per client IP. Idle buckets are dropped once they would be full again.
export class IpRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { bucket: TokenBucket; seen: number }>();
  private readonly idleMs: number;

  constructor(private readonly capacity: number, private readonly refillPerSec: number,
    private readonly clock: () => number = Date.now) {
    this.idleMs = Math.ceil((capacity / refillPerSec) * 1000);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string; socket: { remoteAddress?: string } }>();
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const now = this.clock();
    for (const [key, value] of this.buckets) if (now - value.seen >= this.idleMs) this.buckets.delete(key);
    let entry = this.buckets.get(ip);
    if (!entry) {
      entry = { bucket: new TokenBucket({ capacity: this.capacity, refillPerSec: this.refillPerSec, now: this.clock }), seen: now };
      this.buckets.set(ip, entry);
    }
    entry.seen = now;
    if (!entry.bucket.tryTake()) throw new RateLimitedError('Request rate exceeded', entry.bucket.msUntil());
    return true;
  }
}
