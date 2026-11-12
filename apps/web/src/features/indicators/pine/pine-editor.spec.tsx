import { forceLinting } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PineEditor from './pine-editor';
import { LazyPineEditor } from './pine-editor.lazy';

afterEach(cleanup);

function viewOf(label: string): EditorView {
  const found = EditorView.findFromDOM(screen.getByLabelText(label));
  if (!found) throw new Error('no editor view');
  return found;
}

it('shows the value and reports typed text', () => {
  const onChange = vi.fn();
  render(<PineEditor value="plot(close)" onChange={onChange} label="Pine source" />);
  const view = viewOf('Pine source');
  expect(view.state.doc.toString()).toBe('plot(close)');
  view.dispatch({ changes: { from: 0, insert: '//@version=6\n' } });
  expect(onChange).toHaveBeenCalledWith('//@version=6\nplot(close)');
});

it('replaces the document only when the value differs', () => {
  const { rerender } = render(<PineEditor value="a" onChange={() => undefined} label="src" />);
  const view = viewOf('src');
  const dispatch = vi.spyOn(view, 'dispatch');
  rerender(<PineEditor value="a" onChange={() => undefined} label="src" />);
  expect(dispatch).not.toHaveBeenCalled();
  rerender(<PineEditor value="b" onChange={() => undefined} label="src" />);
  expect(view.state.doc.toString()).toBe('b');
});

it('shows a lint diagnostic on the problem line', async () => {
  const { container } = render(<PineEditor value={'a = 1\nb = bogus()\nc = 3'} onChange={() => undefined} label="src" problem={{ line: 2, message: 'bogus is unsupported' }} />);
  forceLinting(viewOf('src'));
  await waitFor(() => { expect(container.querySelector('.cm-lintRange-error')?.textContent).toBe('b = bogus()'); });
});

it('shows a skeleton, then the editor, through the lazy wrapper', async () => {
  render(<LazyPineEditor value="x" onChange={() => undefined} label="lazy" />);
  expect(screen.getByRole('status')).toBeTruthy();
  await waitFor(() => { expect(viewOf('lazy').state.doc.toString()).toBe('x'); });
});
