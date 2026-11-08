import { describe, expect, it } from 'vitest';
import { calendarFor } from '../domain/calendar';
import { sessionCache } from './session-cache';

describe('FR-CH-6 E12 E13 cached session boundaries', () => {
  it('preserves session methods and exclusive closes across days', () => {
    const original = calendarFor('NSE'); const cached = sessionCache(original);
    const at = Date.parse('2026-11-09T03:45:00Z');
    expect(cached.sessionsOn('2026-11-09')).toEqual(original.sessionsOn('2026-11-09'));
    expect(cached.isOpen(at)).toBe(true); expect(cached.nextOpen(at)).toBe(at);
    expect(cached.sessionContaining(at)).toEqual(original.sessionContaining(at));
    expect(cached.sessionContaining(at + 60000)).toEqual(original.sessionContaining(at));
    expect(cached.sessionContaining(Date.parse('2026-11-09T10:00:00Z'))).toBeNull();
    expect(cached.sessionContaining(at)).toEqual(original.sessionContaining(at));
  });
});
