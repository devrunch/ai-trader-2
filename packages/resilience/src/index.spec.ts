import { expect, it } from 'vitest';
import * as resilience from './index.js';

// NFR-RB-1/2/3, NFR-SC-5: one shared public entry point.
it('exports the complete resilience API', () => {
  expect(Object.keys(resilience).sort()).toEqual([
    'AbortedError', 'CircuitBreaker', 'CircuitOpenError', 'TimeoutError',
    'TokenBucket', 'backoffDelay', 'retry', 'sleep', 'withTimeout',
  ].sort());
});
