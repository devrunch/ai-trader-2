import { describe, expect, it } from 'vitest';
import { commit, lineDiff, revert, type PromptVersion } from './prompt-history';

const at = (n: number) => `2026-11-10T0${String(n)}:00:00.000Z`;
const v1: PromptVersion = { key: 'system', version: 1, content: 'You are a careful assistant.\nUse tools for every number.', parentVersion: null, message: 'file default', author: 'system', createdAt: at(1) };

describe('prompt history (owner request: versions, diffs, undo like commits)', () => {
  it('a save appends the next version with its parent', () => {
    const v2 = commit([v1], 'You are a careful trading assistant.\nUse tools for every number.', 'name the domain', 'admin', at(2));
    expect(v2).toMatchObject({ key: 'system', version: 2, parentVersion: 1, message: 'name the domain', author: 'admin' });
  });

  it('saving unchanged content is a no-op', () => {
    expect(commit([v1], v1.content, 'nothing', 'admin', at(2))).toBeNull();
  });

  it('undo is a revert: a new version with the old content, history only grows', () => {
    const v2 = commit([v1], 'changed', 'edit', 'admin', at(2));
    if (!v2) throw new Error('expected a version');
    const v3 = revert([v1, v2], 1, 'admin', at(3));
    expect(v3).toMatchObject({ version: 3, parentVersion: 2, content: v1.content, message: 'Revert to v1' });
  });

  it('reverting to the current content is a no-op', () => {
    expect(revert([v1], 1, 'admin', at(2))).toBeNull();
  });

  it('line diff marks kept, removed and added lines in order', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { op: ' ', line: 'a' }, { op: '-', line: 'b' }, { op: '+', line: 'B' }, { op: ' ', line: 'c' }, { op: '+', line: 'd' },
    ]);
  });
});
