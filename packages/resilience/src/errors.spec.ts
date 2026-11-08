import { expect, it } from 'vitest';
import { AbortedError, CircuitOpenError, TimeoutError } from './errors.js';

// NFR-RB-2, NFR-RB-3: callers can distinguish recovery reasons.
it('exposes named errors and the remaining circuit wait', () => {
  expect(new TimeoutError()).toMatchObject({ name: 'TimeoutError' });
  expect(new AbortedError()).toMatchObject({ name: 'AbortedError' });
  expect(new CircuitOpenError(123)).toMatchObject({ name: 'CircuitOpenError', retryAfterMs: 123 });
  expect(new TimeoutError()).toBeInstanceOf(Error);
});
