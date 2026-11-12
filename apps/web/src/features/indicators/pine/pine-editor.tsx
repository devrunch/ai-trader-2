import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { PINE_COMPLETIONS } from '@aitrader/contracts';
import { useEffect, useRef } from 'react';
import { pineCompletionSource } from './pine-completions';
import { pineLanguage } from './pine-language';
import { diagnosticsFor, type PineProblem } from './pine-problems';
import { pineTheme } from './pine-theme';

interface Props { value: string; onChange: (value: string) => void; problem?: PineProblem; label: string }

export default function PineEditor({ value, onChange, problem, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const initial = useRef({ value, problem });

  useEffect(() => {
    if (!host.current) return undefined;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: [
          lineNumbers(), lintGutter(), history(), bracketMatching(), pineLanguage, pineTheme,
          autocompletion({ override: [pineCompletionSource(PINE_COMPLETIONS)] }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((u) => { if (u.docChanged) onChangeRef.current(u.state.doc.toString()); }),
        ],
      }),
    });
    const first = initial.current.problem;
    if (first) editor.dispatch(setDiagnostics(editor.state, diagnosticsFor(editor.state.doc.toString(), first)));
    view.current = editor;
    return () => { editor.destroy(); view.current = null; };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch(setDiagnostics(editor.state, problem ? diagnosticsFor(editor.state.doc.toString(), problem) : []));
  }, [problem, value]);

  return <div ref={host} aria-label={label} role="group" className="h-full min-h-40" />;
}
