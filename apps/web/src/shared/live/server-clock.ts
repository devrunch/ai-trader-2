const SAMPLES = 5;

/**
 * Tracks the offset between this device's clock and the server's (E14). Display and staleness timers
 * only: bar boundaries always come from the server.
 */
export class ServerClock {
  private readonly samples: number[] = [];
  private median = 0;

  constructor(private readonly local: () => number = Date.now) {}

  /** Takes one sample; resolves false when the server could not be asked. */
  async sync(serverNow: () => Promise<number>): Promise<boolean> {
    const sent = this.local();
    let server: number;
    try { server = await serverNow(); } catch { return false; }
    const received = this.local();
    this.samples.push(server - (sent + (received - sent) / 2));
    if (this.samples.length > SAMPLES) this.samples.shift();
    const sorted = [...this.samples].sort((a, b) => a - b);
    this.median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    return true;
  }

  offset(): number { return this.median; }
  now(): number { return this.local() + this.median; }
}
