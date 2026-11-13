type ReleaseUnit = '%' | 'K' | 'M' | 'B' | 'T' | '';
export interface ReleaseValue { value: number; unit: ReleaseUnit }

const UNITS: readonly ReleaseUnit[] = ['%', 'K', 'M', 'B', 'T', ''];
const VALUE = /^([<>]?)\s*(-?\d[\d,]*(?:\.\d+)?|-?\.\d+)\s*([%KMBT]?)$/i;

/** A ForexFactory value as a number and its unit: '0.3%', '225K', '1.2M', '<0.1%', '1,234.5'; null when it is not a plain number (a text such as 'Hold'). */
export function parseReleaseValue(text: string | null | undefined): ReleaseValue | null {
  const match = VALUE.exec((text ?? '').trim());
  if (!match) return null;
  const value = Number((match[2] ?? '').replaceAll(',', ''));
  if (!Number.isFinite(value)) return null;
  const unit = UNITS.find(u => u === (match[3] ?? '').toUpperCase());
  return unit === undefined ? null : { value, unit };
}

const round = (n: number): number => Math.round(n * 1e9) / 1e9;

/** Actual minus forecast in the event's own unit; null when either is not a number or the units differ. */
export function surprise(actual: string | null | undefined, forecast: string | null | undefined): number | null {
  const a = parseReleaseValue(actual);
  const f = parseReleaseValue(forecast);
  if (!a || !f || a.unit !== f.unit) return null;
  return round(a.value - f.value);
}

const MIN_SURPRISE_HISTORY = 8;

/** The surprise divided by the population standard deviation of the event's own past surprises; null with fewer than 8 past releases or no spread. */
export function surpriseZ(value: number | null, history: readonly number[]): number | null {
  if (value === null || history.length < MIN_SURPRISE_HISTORY) return null;
  const mean = history.reduce((s, x) => s + x, 0) / history.length;
  const std = Math.sqrt(history.reduce((s, x) => s + (x - mean) ** 2, 0) / history.length);
  return std < 1e-9 ? null : round(value / std);
}
