import { useState } from 'react';
import type { PineScriptDetail } from '@aitrader/contracts';
import { Button } from '../../../shared/ui/button';
import { Skeleton } from '../../../shared/ui/skeleton';
import { usePineScriptList, usePineScriptOpen, usePineScriptWrites } from './use-pine-scripts';

/** My scripts tab: open into the editor, add straight to the chart, delete after a second click. */
export function PineScriptsList({ onOpen, onAdd }: { onOpen: (detail: PineScriptDetail) => void; onAdd: (source: string) => void }) {
  const list = usePineScriptList();
  const opener = usePineScriptOpen();
  const { remove } = usePineScriptWrites();
  const [confirming, setConfirming] = useState<string | null>(null);
  const run = (id: string, then: (detail: PineScriptDetail) => void) => { opener.mutate({ id }, { onSuccess: then }); };

  if (list.isPending) return <div className="space-y-2" aria-label="Loading scripts"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>;
  if (list.isError) return <p role="alert" className="text-sm text-destructive">Your scripts could not be loaded. <Button size="xs" variant="outline" onClick={() => { void list.refetch(); }}>Retry</Button></p>;
  return <div>
    {list.data.scripts.length === 0 && <p className="text-sm text-muted-foreground">No saved scripts yet. Write one in the Editor tab and press Save to keep it here.</p>}
    {opener.isError && <p role="alert" className="mb-2 text-sm text-destructive">That script could not be opened.</p>}
    {remove.isError && <p role="alert" className="mb-2 text-sm text-destructive">That script could not be deleted.</p>}
    <ul className="divide-y divide-border">{list.data.scripts.map(script => <li key={script.id} className="flex items-center gap-2 py-1.5 text-sm">
      <span className="flex-1 truncate font-medium">{script.name}</span>
      <span className="num text-muted-foreground">v{script.currentVersion} · {script.sourceHash.slice(0, 8)}</span>
      <Button size="xs" variant="ghost" aria-label={`Open ${script.name}`} onClick={() => { run(script.id, onOpen); }}>Open</Button>
      <Button size="xs" variant="ghost" aria-label={`Add ${script.name} to chart`} onClick={() => { run(script.id, detail => { onAdd(detail.source); }); }}>Add to chart</Button>
      {confirming === script.id
        ? <Button size="xs" variant="destructive" aria-label={`Confirm delete ${script.name}`} onClick={() => { remove.mutate(script.id); setConfirming(null); }}>Confirm</Button>
        : <Button size="xs" variant="ghost" aria-label={`Delete ${script.name}`} onClick={() => { setConfirming(script.id); }}>Delete</Button>}
    </li>)}</ul>
  </div>;
}
