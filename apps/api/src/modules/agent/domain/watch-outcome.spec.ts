import { describe, expect, it } from 'vitest';
import { dueAt, judge } from './watch-outcome';

describe('judging a What to watch item', () => {
  it.each([
    ['up', 0.8, 'right'], ['up', -0.8, 'wrong'], ['down', -0.5, 'right'], ['down', 0.5, 'wrong'],
    ['up', 0.1, 'wrong'], ['volatile', -1.4, 'right'], ['volatile', 0.4, 'wrong'], ['watch', 3, 'unclear'], ['up', null, 'unclear'],
  ] as const)('%s with a %s%% move is %s', (direction, move, outcome) => {
    expect(judge({ direction }, move)).toBe(outcome);
  });
});

describe('when an item is judged', () => {
  const istTime = (iso: string) => Date.parse(`${iso}+05:30`);
  it('a morning "today" item is judged at 16:00 IST the same day', () => {
    expect(dueAt(istTime('2026-11-16T08:30:00'), 'today')).toBe(istTime('2026-11-16T16:00:00'));
  });
  it('an evening "today" item is judged at 16:00 IST the next day', () => {
    expect(dueAt(istTime('2026-11-16T18:00:00'), 'today')).toBe(istTime('2026-11-17T16:00:00'));
  });
  it('a "this week" item is judged seven days later', () => {
    expect(dueAt(1_000, 'this week')).toBe(1_000 + 7 * 86_400_000);
  });
});
