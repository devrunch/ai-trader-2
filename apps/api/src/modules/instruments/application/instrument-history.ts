import type { InstrumentRepository } from './ports/instrument-repository';
import type { ProviderMapping } from './ports/instrument-source';

export class InstrumentHistory {
  constructor(private readonly repository: InstrumentRepository, private readonly popular: readonly string[]) {}

  async getMapping(id: string, provider: ProviderMapping['provider'], signal: AbortSignal) {
    const mapping = await this.repository.getMapping(id, provider, signal);
    if (!mapping) return undefined;
    const instrument = await this.repository.findById(id, signal);
    if (!instrument) return undefined;
    return { ...mapping, volumeType: instrument.volumeType };
  }

  async held(signal: AbortSignal): Promise<string[]> {
    const active = new Set((await this.repository.listForIndex(signal)).filter(i => i.status === 'active').map(i => String(i.id)));
    const held: string[] = [];
    for (const id of this.popular) {
      if (active.has(id) && await this.repository.getMapping(id, 'kite', signal)) held.push(id);
    }
    return held;
  }

  async heldForFeeds(signal: AbortSignal): Promise<string[]> {
    const active = new Set((await this.repository.listForIndex(signal)).filter(i => i.status === 'active').map(i => String(i.id)));
    const held: string[] = [];
    for (const id of this.popular) {
      if (!active.has(id)) continue;
      for (const provider of ['kite', 'deriv', 'us-delayed'] as const) {
        if (await this.repository.getMapping(id, provider, signal)) held.push(id);
      }
    }
    return held;
  }
}
