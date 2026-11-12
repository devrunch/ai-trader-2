import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shared/api/api-error';
import { diagnosticsFor, problemFromError } from './pine-problems';

const doc = 'a = 1\nb = 2\n   c = bogus()\nd = 4\ne = 5';

describe('problemFromError', () => {
  it('reads the line from the runtime details', () => {
    const err = new ApiError('VALIDATION_FAILED', 'ta.bogus is not supported', 422, 'r1', { reason: 'UNSUPPORTED_FEATURE', feature: 'ta.bogus', line: 3 });
    expect(problemFromError(err)).toEqual({ line: 3, message: 'ta.bogus is not supported' });
  });
  it('returns a message without a line when details carry none', () => {
    expect(problemFromError(new ApiError('UNSUPPORTED', 'boom', 422))).toEqual({ message: 'boom' });
  });
  it('ignores non-integer or non-positive lines', () => {
    expect(problemFromError(new ApiError('UNSUPPORTED', 'boom', 422, undefined, { line: 0 }))).toEqual({ message: 'boom' });
  });
  it('returns undefined for non-API errors', () => { expect(problemFromError(new Error('x'))).toBeUndefined(); });
});

describe('diagnosticsFor', () => {
  it('places the error from the first non-blank character to the end of its line', () => {
    const [d] = diagnosticsFor(doc, { line: 3, message: 'bad' });
    expect(doc.slice(d?.from, d?.to)).toBe('c = bogus()');
    expect(d).toMatchObject({ severity: 'error', message: 'bad', source: 'pine' });
  });
  it('clamps a line past the end to the last line', () => {
    const [d] = diagnosticsFor(doc, { line: 99, message: 'bad' });
    expect(doc.slice(d?.from, d?.to)).toBe('e = 5');
  });
  it('shows an error without a line on line 1', () => {
    const [d] = diagnosticsFor(doc, { message: 'bad' });
    expect(doc.slice(d?.from, d?.to)).toBe('a = 1');
  });
  it('still marks something on an empty document', () => {
    expect(diagnosticsFor('', { message: 'bad' })).toEqual([expect.objectContaining({ from: 0, to: 0 })]);
  });
});
