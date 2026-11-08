import { describe, expect, it } from 'vitest';
import { SessionCalendar } from './session-calendar';

// E13: multiple windows and the bounded next-open search.
describe('session calendar', () => {
  it('supports multiple half-open windows and returns defensive copies', () => {
    const windows = [{ open: 1000, close: 2000 }, { open: 3000, close: 4000 }];
    const cal = new SessionCalendar('TEST', 'UTC', () => windows);
    expect(cal.isOpen(1000)).toBe(true);
    expect(cal.isOpen(2000)).toBe(false);
    expect(cal.sessionContaining(3000)).toEqual(windows[1]);
    expect(cal.nextOpen(2500)).toBe(3000);
    const first = cal.sessionsOn('1970-01-01')[0];
    if (first) first.open = 0;
    expect(windows[0]?.open).toBe(1000);
  });
  it('returns null when no opening exists within fourteen days', () => {
    const cal = new SessionCalendar('CLOSED', 'UTC', () => []);
    expect(cal.nextOpen(0)).toBeNull();
  });
});
