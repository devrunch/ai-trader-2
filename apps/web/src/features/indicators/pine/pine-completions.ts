import { syntaxTree } from '@codemirror/language';
import type { Completion, CompletionSource } from '@codemirror/autocomplete';

export interface PineCompletionEntry { label: string; kind: 'function' | 'variable' | 'constant' | 'keyword'; detail: string }

/** Labels stay fully qualified (`ta.sma`): typing `ta.` replaces the whole word with the full name. */
export function pineCompletionSource(entries: readonly PineCompletionEntry[]): CompletionSource {
  const members: Completion[] = [];
  const topLevel: Completion[] = [];
  const namespaces = new Set<string>();
  for (const e of entries) {
    const completion: Completion = { label: e.label, type: e.kind, detail: e.detail };
    const dot = e.label.indexOf('.');
    if (dot < 0) topLevel.push(completion);
    else { members.push(completion); namespaces.add(e.label.slice(0, dot)); }
  }
  for (const ns of namespaces) topLevel.push({ label: ns, type: 'namespace' });

  return (context) => {
    const word = context.matchBefore(/[A-Za-z_][\w.]*\.?|[A-Za-z_]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const node = syntaxTree(context.state).resolveInner(context.pos, -1).name;
    if (node === 'comment' || node === 'string' || /Comment|String/.test(node)) return null;
    const lineStart = context.state.doc.lineAt(context.pos).from;
    const before = context.state.sliceDoc(lineStart, word.from);
    if (/\/\/|["']/.test(before) && !hasClosedQuotes(before)) return null;
    const dot = word.text.lastIndexOf('.');
    if (dot < 0) return { from: word.from, options: topLevel, validFor: /^[A-Za-z_]\w*$/ };
    const prefix = word.text.slice(0, dot + 1);
    return { from: word.from, options: members.filter((m) => m.label.startsWith(prefix)), validFor: /^[\w.]*$/ };
  };
}

// Odd quote counts mean the cursor sits in an open string; a "//" outside quotes is a comment.
function hasClosedQuotes(before: string): boolean {
  let quote = '';
  for (let i = 0; i < before.length; i++) {
    const ch = before[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '/' && before[i + 1] === '/') return false;
  }
  return quote === '';
}
