import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

// Colours come only from the app theme variables so light and dark follow the page.
const highlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--accent)', fontWeight: '600' },
  { tag: t.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--up)' },
  { tag: t.number, color: 'var(--warning)' },
  { tag: t.typeName, color: 'var(--ind-violet)' },
  { tag: t.atom, color: 'var(--warning)' },
  { tag: t.meta, color: 'var(--ind-teal)' },
  { tag: t.standard(t.variableName), color: 'var(--link)' },
  { tag: t.operator, color: 'var(--muted-foreground)' },
]);

const base = EditorView.theme({
  '&': { backgroundColor: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', height: '100%', fontSize: '13px' },
  '&.cm-focused': { outline: '1px solid var(--ring)' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.5' },
  '.cm-gutters': { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--muted)' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--muted)' },
  '.cm-tooltip': { backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--down)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--down)' },
  '.cm-lint-marker-error': { content: 'none' },
});

export const pineTheme: Extension = [base, syntaxHighlighting(highlight)];
