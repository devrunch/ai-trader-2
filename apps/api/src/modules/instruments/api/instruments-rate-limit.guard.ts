import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { TokenBucket } from '@aitrader/resilience';
import { RateLimitedError } from '../../../shared/errors/index.js';

export const CLOCK: symbol = Symbol('INSTRUMENTS_CLOCK');

@Injectable()
export class InstrumentsRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { bucket: TokenBucket; seen: number }>();

  constructor(@Inject(CLOCK) private readonly clock: () => number) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string; socket: { remoteAddress?: string } }>();
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const now = this.clock();
    // Idle buckets are full after three seconds, so discarding them preserves the quota.
    for (const [key, value] of this.buckets) if (now - value.seen >= 3000) this.buckets.delete(key);
    let entry = this.buckets.get(ip);
    if (!entry) {
      entry = { bucket: new TokenBucket({ capacity: 30, refillPerSec: 10, now: this.clock }), seen: now };
      this.buckets.set(ip, entry);
    }
    entry.seen = now;
    if (!entry.bucket.tryTake()) throw new RateLimitedError('Instrument request rate exceeded', entry.bucket.msUntil());
    return true;
  }
}
