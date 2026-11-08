import { ERROR_CODES } from '@aitrader/contracts';
import { expect, it } from 'vitest';

// SRD §11: the web consumer resolves the shared contract.
it('resolves the eleven shared error codes', () => {
  expect(ERROR_CODES).toHaveLength(11);
});
