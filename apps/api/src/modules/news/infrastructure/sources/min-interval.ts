import type { SourceClient } from '../../../../shared/sources';

/** Lets a call through at most once per interval; the first call is always due. Keeps a free-plan source inside its request budget. */
export class MinInterval {
  private last = Number.NEGATIVE_INFINITY;
  constructor(private readonly ms: number, private readonly clock: () => number = Date.now) {}

  /** True, and starts a new interval, when the last call is old enough. */
  take(): boolean {
    if (this.clock() - this.last < this.ms) return false;
    this.last = this.clock();
    return true;
  }
}

/** A source that needs its own API key and may be called only once per `everyMs`. */
export abstract class KeyedThrottledSource {
  protected abstract readonly everyMs: number;
  private gate: MinInterval | undefined;
  constructor(protected readonly key: string, protected readonly client: SourceClient, private readonly clock: () => number = Date.now) {}

  /** True when the source may call out now. */
  protected due(): boolean { return (this.gate ??= new MinInterval(this.everyMs, this.clock)).take(); }
}
