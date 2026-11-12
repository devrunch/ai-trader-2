import { lazy, Suspense } from 'react';
import type { ComponentProps } from 'react';

const PineEditor = lazy(() => import('./pine-editor'));

/** The only import path for the editor, so CodeMirror loads on demand. */
export function LazyPineEditor(props: ComponentProps<typeof PineEditor>) {
  return (
    <Suspense fallback={<div role="status" aria-label="Loading editor" className="h-full min-h-40 animate-pulse border border-border bg-muted" />}>
      <PineEditor {...props} />
    </Suspense>
  );
}
