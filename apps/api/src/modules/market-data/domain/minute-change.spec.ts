import { describe, expect, it } from 'vitest';
import { minuteStart, percentChange } from './minute-change';

describe('minute helpers', () => {
  it('floors a timestamp to the start of its minute', () => {
    expect(minuteStart(Date.parse('2026-11-11T12:30:59.999Z'))).toBe(Date.parse('2026-11-11T12:30:00Z'));
    expect(minuteStart(Date.parse('2026-11-11T12:31:00Z'))).toBe(Date.parse('2026-11-11T12:31:00Z'));
  });
  it('computes percent change and rejects a zero or negative base', () => {
    expect(percentChange(200, 201)).toBeCloseTo(0.5, 10);
    expect(percentChange(100, 99)).toBeCloseTo(-1, 10);
    expect(percentChange(0, 5)).toBeNull();
    expect(percentChange(-1, 5)).toBeNull();
  });
});
