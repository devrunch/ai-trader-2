import { COMPARE_OPS, type BacktestCondition, type BacktestLevel, type BacktestOperand } from '@aitrader/contracts';

export type CompareOp = (typeof COMPARE_OPS)[number];
export type Combine = 'all' | 'any';
/** Operands are typed as text: a number, a series name, or `name[n]` for n bars back. */
export interface FormCondition { left: string; op: CompareOp; right: string }
export interface FormIndicatorRow { name: string; indicatorId: string; inputsText: string; plot?: string }

export const OP_LABELS: Record<CompareOp, string> = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=', neq: '!=', crossesAbove: 'crosses above', crossesBelow: 'crosses below' };

const NUMBER = /^-?\d+(\.\d+)?$/;
const OFFSET = /^([A-Za-z][A-Za-z0-9_]*)\[(\d+)\]$/;
export const isNumberText = (text: string): boolean => NUMBER.test(text);

function parseOperand(text: string): BacktestOperand {
  const t = text.trim();
  if (NUMBER.test(t)) return { kind: 'value', value: Number(t) };
  const match = OFFSET.exec(t);
  return match ? { kind: 'series', name: match[1] ?? '', offset: Number(match[2]) } : { kind: 'series', name: t };
}
const operandText = (o: BacktestOperand): string => (o.kind === 'value' ? String(o.value) : o.offset === undefined ? o.name : `${o.name}[${String(o.offset)}]`);

export function parseLevel(text: string): BacktestLevel | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  const percent = /^(\d+(?:\.\d+)?)\s*%$/.exec(t);
  if (percent) return { kind: 'percent', percent: Number(percent[1]) };
  const multiple = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\S+)$/i.exec(t);
  return multiple ? { kind: 'series', name: multiple[2] ?? '', multiple: Number(multiple[1]) } : { kind: 'series', name: t, multiple: Number.NaN };
}
export const levelText = (l: BacktestLevel | undefined): string => (l === undefined ? '' : l.kind === 'percent' ? `${String(l.percent)}%` : `${String(l.multiple)} x ${l.name}`);

export function parseInputs(text: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const part of text.split(',')) {
    const [key, ...rest] = part.split('=');
    const value = rest.join('=').trim();
    if (!key?.trim() || value === '') continue;
    out[key.trim()] = NUMBER.test(value) ? Number(value) : value === 'true' ? true : value === 'false' ? false : value;
  }
  return out;
}
export const inputsText = (inputs: Record<string, string | number | boolean>): string => Object.entries(inputs).map(([k, v]) => `${k}=${String(v)}`).join(', ');

/** One compare is returned bare; several are joined by `mode`; none gives undefined. */
export function conditionOf(rows: FormCondition[], mode: Combine): BacktestCondition | undefined {
  const compares: BacktestCondition[] = rows.map(r => ({ kind: 'compare', left: parseOperand(r.left), op: r.op, right: parseOperand(r.right) }));
  if (compares.length === 0) return undefined;
  return compares.length === 1 && compares[0] ? compares[0] : { kind: mode, of: compares };
}

/** The rows for a condition, or null when it is nested logic or `not` (needs the JSON view). */
export function rowsOf(condition: BacktestCondition | undefined): { mode: Combine; rows: FormCondition[] } | null {
  if (!condition) return { mode: 'all', rows: [] };
  if (condition.kind === 'compare') return { mode: 'all', rows: [{ left: operandText(condition.left), op: condition.op, right: operandText(condition.right) }] };
  if (condition.kind === 'not' || condition.of.length < 2) return null;
  const rows: FormCondition[] = [];
  for (const c of condition.of) {
    if (c.kind !== 'compare') return null;
    rows.push({ left: operandText(c.left), op: c.op, right: operandText(c.right) });
  }
  return { mode: condition.kind, rows };
}
