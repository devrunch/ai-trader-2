import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EventSpec } from '@aitrader/contracts';
import { z } from 'zod';
import type { SourceDescriptor } from '../../../../shared/sources';
import type { EventSpecLookup } from '../../application/ports/event-specs';

export const FF_EVENT_SPECS_DESCRIPTOR: SourceDescriptor = {
  id: 'ff-event-specs', owner: 'calendar', kind: 'event knowledge', markets: ['forex', 'global'], envKeys: [], rateLimit: { requests: 1, windowSec: 86_400 }, schedule: 'static',
  terms: 'Event glossary (what each release measures, which side of the forecast is good) vendored from the old product, which extracted it once from ForexFactory event pages; no HTTP.',
  docs: 'https://www.forexfactory.com/calendar',
};

const Entry = z.object({ measures: z.string(), notes: z.string(), source: z.string(), usual_effect: z.string(), why: z.string() });
const normalise = (country: string, title: string): string => `${country.trim().toLowerCase()}|${title.toLowerCase().replace(/\s+/g, ' ').trim()}`;
/** ForexFactory sometimes appends a count or detail in brackets to a recurring title: "Fed Chair Powell Speaks (2)". */
const withoutBrackets = (title: string): string => title.replace(/\s*\([^)]*\)\s*$/, '');

/** 'Actual greater than Forecast is good' means a beat helps the currency; 'less than' means the reverse (unemployment, claims). Anything else (a statement's tone) is not a number comparison. */
export function beatDirection(usualEffect: string): EventSpec['beat'] {
  const effect = usualEffect.toLowerCase();
  if (effect.includes('greater than')) return 'higher-better';
  if (effect.includes('less than')) return 'lower-better';
  return 'unknown';
}

export class EventSpecs implements EventSpecLookup {
  private readonly byKey: ReadonlyMap<string, EventSpec>;

  /** `raw` is the JSON text of the glossary keyed "CUR|Event title"; a file with no entries is an error, not an empty glossary. */
  constructor(raw: string) {
    const parsed = z.record(z.string(), Entry).parse(JSON.parse(raw));
    const entries = Object.entries(parsed);
    if (entries.length === 0) throw new Error('ff-event-specs: the spec file has no entries (the vendored data is missing or the shape changed)');
    this.byKey = new Map(entries.map(([key, e]) => [normalise(key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)), { measures: e.measures, usualEffect: e.usual_effect, why: e.why, notes: e.notes, source: e.source, beat: beatDirection(e.usual_effect) }]));
  }

  static fromFile(): EventSpecs { return new EventSpecs(readFileSync(join(__dirname, 'ff-event-specs.json'), 'utf8')); }

  get size(): number { return this.byKey.size; }

  lookup(country: string, title: string): EventSpec | null {
    return this.byKey.get(normalise(country, title)) ?? this.byKey.get(normalise(country, withoutBrackets(title))) ?? null;
  }
}
