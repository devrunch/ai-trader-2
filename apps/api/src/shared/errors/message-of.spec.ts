import { describe, expect, it } from 'vitest';
import { messageOf } from './errors';

describe('messageOf', () => {
  it('reads Errors, vendor error objects and strings', () => {
    expect(messageOf(new Error('boom'))).toBe('boom');
    expect(messageOf({ status: 'error', message: 'Too many requests', error_type: 'NetworkException' })).toBe('NetworkException: error: Too many requests');
    expect(messageOf({ a: 1 })).toBe('{"a":1}');
    expect(messageOf('plain')).toBe('plain');
  });
});
