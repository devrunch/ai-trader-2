/**
 * Arithmetic for the assistant, so it never does sums in its head: numbers, + - * / % ^, parentheses, unary minus,
 * and a few functions. A hand-written parser: no eval, no property access, nothing but numbers in and out.
 */
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs, sqrt: Math.sqrt, round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d, floor: Math.floor, ceil: Math.ceil,
  ln: Math.log, log: Math.log10, exp: Math.exp, pow: Math.pow, min: Math.min, max: Math.max,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export class CalcError extends Error { override readonly name = 'CalcError'; }

export function calculate(expression: string): number {
  if (expression.length > 500) throw new CalcError('Expression too long');
  const tokens = expression.match(/\d+(?:\.\d+)?(?:e[+-]?\d+)?|[a-z]+|[-+*/%^(),]|\S/gi) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const expect = (t: string) => { if (next() !== t) throw new CalcError(`Expected "${t}"`); };

  const primary = (): number => {
    const t = next();
    if (t === undefined) throw new CalcError('Unexpected end');
    if (t === '(') { const v = sum(); expect(')'); return v; }
    if (t === '-') return -power();
    if (t === '+') return power();
    if (/^\d/.test(t)) return Number(t);
    const name = t.toLowerCase();
    const constant = CONSTANTS[name];
    if (constant !== undefined) return constant;
    const fn = FUNCTIONS[name];
    if (!fn) throw new CalcError(`Unknown name "${t}"`);
    expect('(');
    const args = [sum()];
    while (peek() === ',') { next(); args.push(sum()); }
    expect(')');
    return fn(...args);
  };
  const power = (): number => { const base = primary(); if (peek() === '^') { next(); return base ** power(); } return base; };
  const product = (): number => {
    let v = power();
    for (let op = peek(); op === '*' || op === '/' || op === '%'; op = peek()) {
      next(); const r = power();
      if ((op === '/' || op === '%') && r === 0) throw new CalcError('Division by zero');
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    for (let op = peek(); op === '+' || op === '-'; op = peek()) { next(); v = op === '+' ? v + product() : v - product(); }
    return v;
  };

  const value = sum();
  if (i < tokens.length) throw new CalcError(`Unexpected "${tokens[i] ?? ''}"`);
  if (!Number.isFinite(value)) throw new CalcError('Result is not a finite number');
  return value;
}
