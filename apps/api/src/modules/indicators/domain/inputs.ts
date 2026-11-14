import { PRICE_SOURCES, isSourceRef, type IndicatorInputDef, type PriceSource } from '@aitrader/contracts';
import { InvalidIndicatorInputError } from './errors';
import { EXTERNAL_SOURCE, type KernelSource } from './source';

type InputValue = number | boolean | string;
export type ResolvedInputs = Readonly<Record<string, InputValue>>;

/** Applies defaults and the definition's bounds; unknown keys are rejected so a typo never passes silently. */
/** Common names for an indicator's look-back, read as `length` when the indicator has one ("period: 14" means "length: 14"). */
const LENGTH_ALIASES = ['period', 'periods', 'len', 'window', 'lookback'];

function withAliases(defs: readonly IndicatorInputDef[], raw: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  if (!defs.some(d => d.id === 'length') || 'length' in raw) return raw;
  const alias = LENGTH_ALIASES.find(a => a in raw && !defs.some(d => d.id === a));
  if (!alias) return raw;
  const { [alias]: value, ...rest } = raw;
  return { ...rest, length: value };
}

export function resolveInputs(defs: readonly IndicatorInputDef[], given: Readonly<Record<string, unknown>>): ResolvedInputs {
  const raw = withAliases(defs, given);
  for (const key of Object.keys(raw)) {
    if (!defs.some(def => def.id === key)) throw new InvalidIndicatorInputError(key, 'is not an input of this indicator');
  }
  return Object.fromEntries(defs.map(def => [def.id, resolveOne(def, raw[def.id])]));
}

function resolveOne(def: IndicatorInputDef, value: unknown): InputValue {
  if (value === undefined) return def.default;
  switch (def.type) {
    case 'int':
    case 'float': {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidIndicatorInputError(def.id, 'must be a number');
      if (def.type === 'int' && !Number.isInteger(value)) throw new InvalidIndicatorInputError(def.id, 'must be an integer');
      if (def.min !== undefined && value < def.min) throw new InvalidIndicatorInputError(def.id, `must be at least ${String(def.min)}`);
      if (def.max !== undefined && value > def.max) throw new InvalidIndicatorInputError(def.id, `must be at most ${String(def.max)}`);
      return value;
    }
    case 'bool':
      if (typeof value !== 'boolean') throw new InvalidIndicatorInputError(def.id, 'must be true or false');
      return value;
    case 'string':
      if (typeof value !== 'string' || !def.options.includes(value)) throw new InvalidIndicatorInputError(def.id, `must be one of ${def.options.join(', ')}`);
      return value;
    case 'source':
      if (isSourceRef(value)) return EXTERNAL_SOURCE;
      if (!isPriceSource(value)) throw new InvalidIndicatorInputError(def.id, `must be one of ${PRICE_SOURCES.join(', ')}`);
      return value;
  }
}

function isPriceSource(value: unknown): value is PriceSource {
  return PRICE_SOURCES.some(source => source === value);
}

export function numberInput(inputs: ResolvedInputs, id: string): number {
  const value = inputs[id];
  if (typeof value !== 'number') throw new InvalidIndicatorInputError(id, 'must be a number');
  return value;
}

export function boolInput(inputs: ResolvedInputs, id: string): boolean {
  const value = inputs[id];
  if (typeof value !== 'boolean') throw new InvalidIndicatorInputError(id, 'must be true or false');
  return value;
}

export function stringInput(inputs: ResolvedInputs, id: string): string {
  const value = inputs[id];
  if (typeof value !== 'string') throw new InvalidIndicatorInputError(id, 'must be a string');
  return value;
}

export function sourceInput(inputs: ResolvedInputs, id: string): KernelSource {
  const value = inputs[id];
  if (value !== EXTERNAL_SOURCE && !isPriceSource(value)) throw new InvalidIndicatorInputError(id, 'must be a price source');
  return value;
}
