import { EventEmitter } from 'node:events';
import { expect, it } from 'vitest';
import { watchCheckedOut } from './checked-out';

it('a dropped connection while checked out is recorded, not thrown', () => {
  const client = new EventEmitter();
  const watch = watchCheckedOut(client);
  expect(() => client.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
  expect(watch.failed()).toBe(true);
  watch.stop();
  expect(client.listenerCount('error')).toBe(0);
});
