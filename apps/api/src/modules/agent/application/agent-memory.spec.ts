import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../../../shared/errors';
import { AgentMemory, type MemoryNote, type MemoryStore } from './agent-memory';

function memory() {
  const rows: Array<MemoryNote & { userId: string }> = [];
  let n = 0;
  const store: MemoryStore = {
    list: u => Promise.resolve(rows.filter(r => r.userId === u).map(({ userId: _u, ...r }) => r)),
    add: (u, note) => { rows.push({ ...note, userId: u, createdAt: new Date(n).toISOString() }); return Promise.resolve(); },
    remove: (u, id) => { const i = rows.findIndex(r => r.userId === u && r.id === id); if (i >= 0) rows.splice(i, 1); return Promise.resolve(i >= 0); },
  };
  return new AgentMemory(store, { id: () => `0000000${String(++n)}-aaaa-4000-8000-000000000000` });
}

describe('assistant memory', () => {
  it('keeps short notes per user, drops repeats, and shows them to the assistant with short ids', async () => {
    const m = memory();
    await m.remember('u1', '  Risks 1%   per trade ');
    await m.remember('u1', 'risks 1% per trade');
    await m.remember('u2', 'Trades MCX gold');
    expect((await m.list('u1')).map(x => x.note)).toEqual(['Risks 1% per trade']);
    expect(await m.promptFor('u1')).toContain('- [00000001] Risks 1% per trade');
    expect(await m.promptFor('u3')).toBe('');
  });

  it('forgets by id or by the short id in the prompt, only the owner\'s notes', async () => {
    const m = memory();
    await m.remember('u1', 'Swing trader');
    await expect(m.forget('u2', '00000001')).rejects.toBeInstanceOf(NotFoundError);
    await m.forget('u1', '00000001');
    expect(await m.list('u1')).toEqual([]);
  });

  it('holds at most 30 notes', async () => {
    const m = memory();
    for (let i = 0; i < 30; i++) await m.remember('u1', `fact ${String(i)}`);
    await expect(m.remember('u1', 'one more')).rejects.toBeInstanceOf(ConflictError);
  });
});
