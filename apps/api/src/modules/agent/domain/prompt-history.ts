export interface PromptVersion {
  key: string;
  version: number;
  content: string;
  parentVersion: number | null;
  message: string;
  author: string;
  createdAt: string;
}

const head = (history: readonly PromptVersion[]): PromptVersion | undefined =>
  history.reduce<PromptVersion | undefined>((best, v) => (!best || v.version > best.version ? v : best), undefined);

/** A save: the next version on top of the newest one. Unchanged content is not a new version (null). */
export function commit(history: readonly PromptVersion[], content: string, message: string, author: string, createdAt: string): PromptVersion | null {
  const top = head(history);
  if (top && top.content === content) return null;
  return { key: top?.key ?? '', version: (top?.version ?? 0) + 1, content, parentVersion: top?.version ?? null, message, author, createdAt };
}

/** Undo as a revert: a new version carrying an earlier version's content, so history is never rewritten. */
export function revert(history: readonly PromptVersion[], toVersion: number, author: string, createdAt: string): PromptVersion | null {
  const target = history.find(v => v.version === toVersion);
  if (!target) throw new RangeError(`No version ${String(toVersion)}`);
  return commit(history, target.content, `Revert to v${String(toVersion)}`, author, createdAt);
}

export type DiffLine = { op: ' ' | '-' | '+'; line: string };

/** Line diff by longest common subsequence; prompts are small, so O(n·m) is fine. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n'); const b = after.split('\n');
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i] ?? []; const next = lcs[i + 1] ?? [];
      row[j] = a[i] === b[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0; let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ op: ' ', line: a[i] ?? '' }); i++; j++; }
    else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) { out.push({ op: '-', line: a[i] ?? '' }); i++; }
    else { out.push({ op: '+', line: b[j] ?? '' }); j++; }
  }
  while (i < a.length) out.push({ op: '-', line: a[i++] ?? '' });
  while (j < b.length) out.push({ op: '+', line: b[j++] ?? '' });
  return out;
}
