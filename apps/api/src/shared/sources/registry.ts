import type { SourceDescriptor, SourceState } from './descriptor';

export interface SourceStatus { descriptor: SourceDescriptor; state: SourceState; /** Keys that are missing, when off. */ missingKeys: string[] }

/** The one list of sources. A source runs only when every key it needs is set; a missing key is reported "off (no key)", never a crash. */
export class SourceRegistry {
  private readonly byId = new Map<string, SourceDescriptor>();

  constructor(private readonly env: Readonly<Record<string, string | undefined>>) {}

  register(...descriptors: SourceDescriptor[]): void {
    for (const d of descriptors) {
      if (this.byId.has(d.id) && this.byId.get(d.id) !== d) throw new Error(`Source "${d.id}" is registered twice`);
      this.byId.set(d.id, d);
    }
  }

  get(id: string): SourceDescriptor {
    const d = this.byId.get(id);
    if (!d) throw new Error(`Unknown source "${id}": add it to docs/DATA-SOURCES.md and register its descriptor`);
    return d;
  }

  /** Whether every key the source needs is set (blank counts as unset). */
  isEnabled(id: string): boolean { return this.missingKeys(this.get(id)).length === 0; }

  list(): SourceStatus[] {
    return [...this.byId.values()].map(descriptor => {
      const missingKeys = this.missingKeys(descriptor);
      return { descriptor, state: missingKeys.length === 0 ? 'enabled' : 'off', missingKeys };
    });
  }

  private missingKeys(d: SourceDescriptor): string[] { return d.envKeys.filter(key => !(this.env[key] ?? '').trim()); }
}
