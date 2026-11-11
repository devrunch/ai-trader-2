import { createHash } from 'node:crypto';
import { PINE_SCRIPT_LIMITS, type PineScriptSummary, type PineScriptVersion } from '@aitrader/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { PineScripts, type PineScriptStore, type StoredScript } from './pine-scripts';

class FakeStore implements PineScriptStore {
  scripts = new Map<string, StoredScript & { userId: string }>();
  rows = new Map<string, Array<PineScriptVersion & { source: string }>>();
  list(userId: string): Promise<PineScriptSummary[]> {
    return Promise.resolve([...this.scripts.values()].filter(s => s.userId === userId).map(s => {
      const latest = this.rows.get(s.id)?.at(-1);
      return { id: s.id, name: s.name, currentVersion: latest?.version ?? 0, sourceHash: latest?.sourceHash ?? '', updatedAt: s.updatedAt };
    }));
  }
  atomically<T>(fn: (store: PineScriptStore) => Promise<T>): Promise<T> { return fn(this); }
  lockUser(): Promise<void> { return Promise.resolve(); }
  count(userId: string): Promise<number> { return Promise.resolve([...this.scripts.values()].filter(s => s.userId === userId).length); }
  insertScript(row: StoredScript & { userId: string }): Promise<void> { this.scripts.set(row.id, row); this.rows.set(row.id, []); return Promise.resolve(); }
  find(userId: string, id: string): Promise<StoredScript | null> {
    const s = this.scripts.get(id);
    return Promise.resolve(s?.userId === userId ? { id: s.id, name: s.name, updatedAt: s.updatedAt } : null);
  }
  versions(scriptId: string): Promise<PineScriptVersion[]> {
    return Promise.resolve([...(this.rows.get(scriptId) ?? [])].reverse().map(({ version, sourceHash, createdAt }) => ({ version, sourceHash, createdAt })));
  }
  source(scriptId: string, version: number): Promise<string | null> { return Promise.resolve(this.rows.get(scriptId)?.find(v => v.version === version)?.source ?? null); }
  addVersion(scriptId: string, row: PineScriptVersion & { source: string }): Promise<void> { this.rows.get(scriptId)?.push(row); return Promise.resolve(); }
  dropVersionsUpTo(scriptId: string, version: number): Promise<void> {
    this.rows.set(scriptId, (this.rows.get(scriptId) ?? []).filter(v => v.version > version)); return Promise.resolve();
  }
  touch(scriptId: string, name: string | undefined, at: string): Promise<void> {
    const s = this.scripts.get(scriptId);
    if (s) { if (name !== undefined) s.name = name; s.updatedAt = at; }
    return Promise.resolve();
  }
  remove(userId: string, id: string): Promise<boolean> {
    if (this.scripts.get(id)?.userId !== userId) return Promise.resolve(false);
    this.scripts.delete(id); this.rows.delete(id); return Promise.resolve(true);
  }
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
let store: FakeStore;
let scripts: PineScripts;
let n: number;
beforeEach(() => {
  store = new FakeStore(); n = 0;
  scripts = new PineScripts(store, { id: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, now: () => new Date(Date.UTC(2026, 10, 11, 9, 0, n)) });
});

describe('saving and versions (FR-IN-19, FR-IN-28)', () => {
  it('creates version 1 with the sha256 of the exact source', async () => {
    const d = await scripts.create('u1', { name: 'RSI', source: 'plot(close)' });
    expect(d).toMatchObject({ name: 'RSI', currentVersion: 1, shownVersion: 1, source: 'plot(close)', sourceHash: sha('plot(close)') });
  });

  it('adds no version and keeps the hash when the same source is saved again', async () => {
    const a = await scripts.create('u1', { name: 'RSI', source: 'plot(close)' });
    const b = await scripts.save('u1', a.id, { source: 'plot(close)' });
    expect(b.versions).toHaveLength(1);
    expect(b.sourceHash).toBe(a.sourceHash);
  });

  it('adds version 2 with the new hash when the source changes', async () => {
    const a = await scripts.create('u1', { name: 'RSI', source: 'plot(close)' });
    const b = await scripts.save('u1', a.id, { name: 'RSI 2', source: 'plot(open)' });
    expect(b).toMatchObject({ name: 'RSI 2', currentVersion: 2, sourceHash: sha('plot(open)'), source: 'plot(open)' });
    expect(b.versions.map(v => v.version)).toEqual([2, 1]);
  });

  it('renames without a new version when only the name changes', async () => {
    const a = await scripts.create('u1', { name: 'RSI', source: 'x' });
    const b = await scripts.save('u1', a.id, { name: 'Renamed', source: 'x' });
    expect(b).toMatchObject({ name: 'Renamed', currentVersion: 1 });
  });

  it('drops the oldest at the 51st version and keeps numbers increasing', async () => {
    const a = await scripts.create('u1', { name: 'RSI', source: 's1' });
    let last = a;
    for (let i = 2; i <= PINE_SCRIPT_LIMITS.versions + 1; i++) last = await scripts.save('u1', a.id, { source: `s${String(i)}` });
    expect(last.currentVersion).toBe(51);
    expect(last.versions).toHaveLength(50);
    expect(last.versions.at(-1)?.version).toBe(2);
    await expect(scripts.get('u1', a.id, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('opens an older version with its own source and hash', async () => {
    const a = await scripts.create('u1', { name: 'RSI', source: 'one' });
    await scripts.save('u1', a.id, { source: 'two' });
    const old = await scripts.get('u1', a.id, 1);
    expect(old).toMatchObject({ source: 'one', shownVersion: 1, currentVersion: 2, sourceHash: sha('two') });
  });

  it('returns 404 for an unknown version', async () => {
    const a = await scripts.create('u1', { name: 'RSI', source: 'one' });
    await expect(scripts.get('u1', a.id, 9)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ownership, cap and delete', () => {
  it('rejects the 101st script with SCRIPT_LIMIT', async () => {
    for (let i = 0; i < PINE_SCRIPT_LIMITS.scripts; i++) await scripts.create('u1', { name: `s${String(i)}`, source: 'x' });
    await expect(scripts.create('u1', { name: 'one more', source: 'x' })).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'SCRIPT_LIMIT' } });
    await expect(scripts.create('u2', { name: 'other user', source: 'x' })).resolves.toBeDefined();
  });

  it('hides another user\'s script on read, save and delete', async () => {
    const a = await scripts.create('u1', { name: 'RSI', source: 'x' });
    await expect(scripts.get('u2', a.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(scripts.save('u2', a.id, { source: 'y' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(scripts.remove('u2', a.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await scripts.list('u2')).scripts).toEqual([]);
  });

  it('deletes own scripts', async () => {
    const a = await scripts.create('u1', { name: 'RSI', source: 'x' });
    await scripts.remove('u1', a.id);
    expect((await scripts.list('u1')).scripts).toEqual([]);
    await expect(scripts.get('u1', a.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
