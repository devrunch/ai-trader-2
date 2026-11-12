import { describe, expect, it } from 'vitest';
import { PINE_COMPLETIONS, PINE_COVERAGE } from './pine-coverage.js';
import { PineCoverageRowSchema } from './pine-script.js';

describe('generated Pine coverage (FR-IN-26, FR-IN-27)', () => {
  it('has only valid rows, one per group and feature', () => {
    expect(PINE_COVERAGE.length).toBeGreaterThan(0);
    for (const row of PINE_COVERAGE) expect(PineCoverageRowSchema.safeParse(row).success).toBe(true);
    const keys = PINE_COVERAGE.map(row => `${row.group}/${row.feature}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every refused row the runtime reason', () => {
    for (const row of PINE_COVERAGE.filter(r => r.status === 'refused')) expect(row.note).not.toBe('');
  });

  it('offers each completion label once', () => {
    const labels = PINE_COMPLETIONS.map(c => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
