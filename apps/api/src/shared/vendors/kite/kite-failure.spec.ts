import { describe, expect, it } from 'vitest';
import { sanitizeFailureMessage } from './kite-failure';

describe('sanitizeFailureMessage', () => {
  it('redacts configured secrets, token shapes and one-time codes', () => {
    const out = sanitizeFailureMessage('bad password hunter2-secret, totp 123456, request_token=abcDEF123 token ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 at https://kite.zerodha.com/x?request_token=zzz', ['hunter2-secret']);
    expect(out).not.toMatch(/hunter2|123456|abcDEF123|ABCDEFGHIJ|zzz/);
    expect(out).toContain('https://kite.zerodha.com/x');
  });
  it('caps length and collapses whitespace', () => {
    const out = sanitizeFailureMessage(`a\n\n${'word '.repeat(100)}`);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).not.toMatch(/\n/);
  });
});
