import { describe, expect, it } from 'vitest';
import { calculate } from './calculator';

describe('calculate', () => {
  it('does arithmetic with precedence, powers and functions', () => {
    expect(calculate('2 + 3 * 4')).toBe(14);
    expect(calculate('(2 + 3) * 4')).toBe(20);
    expect(calculate('2 ^ 3 ^ 2')).toBe(512);
    expect(calculate('-3 + 5')).toBe(2);
    expect(calculate('100000 * 0.01 / (1325 - 1310)')).toBeCloseTo(66.6667, 4);
    expect(calculate('round(sqrt(2), 3)')).toBe(1.414);
    expect(calculate('max(1, 5, 3) + min(4, 2)')).toBe(7);
    expect(calculate('1e3 / 4')).toBe(250);
  });

  it('refuses anything that is not arithmetic', () => {
    for (const bad of ['process.exit(1)', 'constructor', '1 / 0', '2 +', '(1', 'alert(1)', '1; 2', 'x'.repeat(501)]) {
      expect(() => calculate(bad), bad).toThrow();
    }
  });
});
