import { CircuitOpenError } from './errors.js';

type Options = { failureThreshold: number; openMs: number; now?: () => number; isFailure?: (err: unknown) => boolean };

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | undefined;
  private probing = false;
  private readonly now: () => number;

  constructor(private readonly opts: Options) {
    this.now = opts.now ?? Date.now;
  }

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.openedAt === undefined) return 'closed';
    return this.now() - this.openedAt >= this.opts.openMs ? 'half-open' : 'open';
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.state;
    if (state === 'open' || this.probing) {
      throw new CircuitOpenError(Math.max(0, (this.openedAt ?? this.now()) + this.opts.openMs - this.now()));
    }
    const probe = state === 'half-open';
    if (probe) this.probing = true;
    try {
      const result = await fn();
      // Calls admitted before opening must not overwrite the recovery probe.
      if (probe || this.openedAt === undefined) {
        this.failures = 0;
        this.openedAt = undefined;
      }
      return result;
    } catch (err: unknown) {
      if (this.opts.isFailure?.(err) !== false && (probe || this.openedAt === undefined)) {
        this.failures++;
        if (probe || this.failures >= this.opts.failureThreshold) this.openedAt = this.now();
      }
      throw err;
    } finally {
      if (probe) this.probing = false;
    }
  }
}
