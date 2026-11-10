import { describe, expect, it } from 'vitest';
import type { PromptVersion } from '../domain/prompt-history';
import { PromptRegistry, type PromptStore } from './prompt-registry';

function memoryStore(): PromptStore {
  const rows: PromptVersion[] = [];
  return {
    history: key => Promise.resolve(rows.filter(r => r.key === key).sort((a, b) => b.version - a.version)),
    append: version => {
      if (rows.some(r => r.key === version.key && r.version === version.version)) return Promise.reject(new Error('conflict'));
      rows.push(version); return Promise.resolve();
    },
  };
}
const defaults = { keys: () => ['system'], read: (key: string) => (key === 'system' ? 'Default system prompt.' : null) };
let n = 0;
const registry = () => new PromptRegistry(memoryStore(), defaults, () => `2026-11-10T00:00:${String(n++).padStart(2, '0')}.000Z`);

describe('PromptRegistry (owner request: admin-editable, versioned, undo)', () => {
  it('serves the file default as version 0 until someone edits it', async () => {
    expect(await registry().active('system')).toEqual({ key: 'system', version: 0, content: 'Default system prompt.', source: 'file' });
  });

  it('a save becomes the active version and history lists it first', async () => {
    const r = registry();
    await r.save('system', 'Edited prompt.', 'tighten wording', 'admin');
    expect(await r.active('system')).toMatchObject({ version: 1, content: 'Edited prompt.', source: 'admin' });
    expect((await r.history('system')).map(v => v.version)).toEqual([1]);
  });

  it('revert and reset add versions instead of rewriting history', async () => {
    const r = registry();
    await r.save('system', 'one', 'a', 'admin');
    await r.save('system', 'two', 'b', 'admin');
    await r.revert('system', 1, 'admin');
    expect(await r.active('system')).toMatchObject({ version: 3, content: 'one' });
    await r.reset('system', 'admin');
    expect(await r.active('system')).toMatchObject({ version: 4, content: 'Default system prompt.' });
    expect((await r.history('system')).map(v => v.message)).toEqual(['Reset to file default', 'Revert to v1', 'b', 'a']);
  });

  it('diff compares any two versions, version 0 being the file default', async () => {
    const r = registry();
    await r.save('system', 'Default system prompt.\nNew rule.', 'add rule', 'admin');
    expect(await r.diff('system', 0, 1)).toEqual([{ op: ' ', line: 'Default system prompt.' }, { op: '+', line: 'New rule.' }]);
  });

  it('unknown keys are rejected; saving unchanged content is a no-op', async () => {
    const r = registry();
    await expect(r.save('nope', 'x', 'm', 'admin')).rejects.toThrow('Unknown prompt');
    expect(await r.save('system', 'Default system prompt.', 'same', 'admin')).toBeNull();
  });
});
