import { lazy, Suspense } from 'react';
import { usePineDialog } from './pine-dialog-store';

const PineEditorDialog = lazy(() => import('./pine-editor-dialog'));

/** Mounts the dialog chunk only once someone opens it. */
export function PineDialogHost() {
  const target = usePineDialog(state => state.target);
  if (!target) return null;
  return <Suspense fallback={null}><PineEditorDialog target={target} /></Suspense>;
}
