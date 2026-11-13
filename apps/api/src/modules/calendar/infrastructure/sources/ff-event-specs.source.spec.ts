import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EventSpecs, FF_EVENT_SPECS_DESCRIPTOR, beatDirection } from './ff-event-specs.source';

describe('ff-event-specs', () => {
  const specs = EventSpecs.fromFile();

  it('loads the 693 vendored entries', () => { expect(specs.size).toBe(693); });

  it('reads CPI m/m with its direction, and tolerates case, spacing and a bracketed suffix', () => {
    const cpi = specs.lookup('USD', 'CPI m/m');
    expect(cpi).toMatchObject({ beat: 'higher-better', usualEffect: "'Actual' greater than 'Forecast' is good for currency" });
    expect(cpi?.measures.length).toBeGreaterThan(10);
    expect(specs.lookup('usd', '  cpi   m/m ')).toEqual(cpi);
    expect(specs.lookup('USD', 'CPI m/m (2)')).toEqual(cpi);
  });

  it('marks exactly the 29 inverted events lower-better and the hawkish ones unknown', () => {
    expect(specs.lookup('USD', 'Unemployment Rate')?.beat).toBe('lower-better');
    expect(specs.lookup('USD', 'FOMC Statement')?.beat).toBe('unknown');
    const raw = z.record(z.string(), z.unknown()).parse(JSON.parse(readFileSync(join(__dirname, 'ff-event-specs.json'), 'utf8')));
    const inverted = Object.keys(raw).filter(k => specs.lookup(k.slice(0, 3), k.slice(4))?.beat === 'lower-better');
    expect(inverted).toHaveLength(29);
  });

  it('returns null for an unknown event', () => { expect(specs.lookup('USD', 'Summit of Nobody')).toBeNull(); });

  it('rejects a spec file with zero entries or the wrong shape', () => {
    expect(() => new EventSpecs('{}')).toThrow('no entries');
    expect(() => new EventSpecs('{"USD|X":{"measures":1}}')).toThrow();
  });

  it('parses the direction from the usual-effect sentence', () => {
    expect(beatDirection("'Actual' less than 'Forecast' is good for currency")).toBe('lower-better');
    expect(beatDirection('')).toBe('unknown');
  });

  it('declares itself static with no key', () => { expect(FF_EVENT_SPECS_DESCRIPTOR).toMatchObject({ schedule: 'static', envKeys: [] }); });
});
