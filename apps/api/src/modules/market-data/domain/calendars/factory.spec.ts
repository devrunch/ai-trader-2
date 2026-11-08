import { expect, it } from 'vitest';
import { calendarFor } from './factory';

it('rejects an unsupported exchange (E13)', () => {
  expect(() => calendarFor('UNKNOWN')).toThrow('Unsupported exchange');
});
