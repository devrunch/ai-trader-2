import { isSourceRef, type IndicatorInputDef } from '@aitrader/contracts';
import { decodeRef, encodeRef } from './source-refs';
import type { InputValues } from './state/indicator-store';

/** Text for number fields while typing; booleans and choices as they are. */
export type Draft = Record<string, string | boolean>;

export function draftFrom(defs: readonly IndicatorInputDef[], inputs: InputValues): Draft {
  return Object.fromEntries(defs.map(def => {
    const value = inputs[def.id] ?? def.default;
    return [def.id, typeof value === 'boolean' ? value : isSourceRef(value) ? encodeRef(value) : String(value)];
  }));
}

/** Checks the draft against the same bounds the engine enforces, so most mistakes show before a request. */
export function readDraft(defs: readonly IndicatorInputDef[], draft: Draft): { ok: true; values: InputValues } | { ok: false; errors: Record<string, string> } {
  const values: InputValues = {};
  const errors: Record<string, string> = {};
  for (const def of defs) {
    const raw = draft[def.id];
    if (def.type === 'bool') { values[def.id] = raw === true; continue; }
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (def.type === 'source') { values[def.id] = decodeRef(text) ?? (text || def.default); continue; }
    if (def.type === 'string') { values[def.id] = text || def.default; continue; }
    const value = Number(text);
    if (text === '' || !Number.isFinite(value)) errors[def.id] = 'Enter a number';
    else if (def.type === 'int' && !Number.isInteger(value)) errors[def.id] = 'Enter a whole number';
    else if (def.min !== undefined && value < def.min) errors[def.id] = `At least ${String(def.min)}`;
    else if (def.max !== undefined && value > def.max) errors[def.id] = `At most ${String(def.max)}`;
    else values[def.id] = value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

/** "RSI 14 close": the legend's short form of the inputs that are numbers or choices. */
export function inputSummary(defs: readonly IndicatorInputDef[], inputs: InputValues, nameOf: (key: string) => string = key => key): string {
  return defs.filter(def => def.type !== 'bool' && def.id !== 'offset').map(def => {
    const value = inputs[def.id] ?? def.default;
    return isSourceRef(value) ? nameOf(value.from) : String(value);
  }).join(' ');
}
