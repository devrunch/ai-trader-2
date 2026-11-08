import { expect, it } from 'vitest';
import { resolveRequestId } from './request-id';

// NFR-OB-1
it('keeps a valid incoming request id', () => {
  expect(resolveRequestId('abc-123_X')).toBe('abc-123_X');
});
it('replaces an invalid or oversized request id', () => {
  for (const header of ['a b', 'a'.repeat(65), ['x', 'y'], undefined]) {
    expect(resolveRequestId(header)).toMatch(/^[0-9a-f-]{36}$/);
  }
});
