import { describe, expect, it } from 'vitest';
import { taskThreadId } from './task-thread';

describe('taskThreadId', () => {
  it('is the same valid UUID every time for a user and differs between users', () => {
    const id = taskThreadId('d013cd61-1e0d-409c-9478-38110a2f45a2');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(taskThreadId('d013cd61-1e0d-409c-9478-38110a2f45a2')).toBe(id);
    expect(taskThreadId('another-user')).not.toBe(id);
  });
});
