export class TokenBucket {
  private tokens: number;
  private updatedAt: number;
  private readonly now: () => number;

  constructor(private readonly opts: { capacity: number; refillPerSec: number; now?: () => number }) {
    this.now = opts.now ?? Date.now;
    this.updatedAt = this.now();
    this.tokens = opts.capacity;
  }

  tryTake(n = 1): boolean {
    this.refill();
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }

  msUntil(n = 1): number {
    this.refill();
    if (n > this.opts.capacity) return Infinity;
    if (this.tokens >= n) return 0;
    return Math.ceil((n - this.tokens) * 1000 / this.opts.refillPerSec);
  }

  private refill(): void {
    const now = this.now();
    this.tokens = Math.min(this.opts.capacity, this.tokens + Math.max(0, now - this.updatedAt) * this.opts.refillPerSec / 1000);
    this.updatedAt = Math.max(now, this.updatedAt);
  }
}
