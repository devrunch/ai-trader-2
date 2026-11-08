import { ERROR_CODES } from '@aitrader/contracts';
import { expect, it } from 'vitest';

// SRD §11: the web consumer resolves the shared contract.
it('resolves the twelve shared error codes including UNSUPPORTED (FR-MD-4)', () => {
  expect(ERROR_CODES).toHaveLength(12);
  expect(ERROR_CODES).toContain('UNSUPPORTED');
});
