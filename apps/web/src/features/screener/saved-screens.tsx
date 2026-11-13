import { useState } from 'react';
import type { SavedScreen } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import type { useSavedScreens, useScreenActions } from './use-screener';

type Actions = ReturnType<typeof useScreenActions>;

export function SavedScreens({ list, actions, onLoad }: { list: ReturnType<typeof useSavedScreens>; actions: Actions; onLoad: (s: SavedScreen) => void }) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const error = actions.rename.error ?? actions.remove.error;
  return <aside aria-label="Saved screens" className="border-b p-3 text-[12px] md:border-b-0 md:border-r">
    <h2 className="mb-2 font-semibold">Saved screens</h2>
    {list.isPending ? <div className="space-y-1"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
      : list.isError ? <p role="alert" className="text-down">Saved screens are unavailable right now. {list.error.message}</p>
      : list.data.items.length === 0 ? <p className="text-muted-foreground">No saved screens yet.</p>
      : <ul className={list.isFetching ? 'opacity-70' : ''}>{list.data.items.map(s => <li key={s.id} className="border-b py-1">
        {renaming?.id === s.id
          ? <form className="flex gap-1" onSubmit={e => { e.preventDefault(); actions.rename.mutate(renaming, { onSuccess: () => { setRenaming(null); } }); }}>
            <input aria-label="New name" className="h-7 min-w-0 flex-1 rounded border bg-background px-1.5" value={renaming.name} onChange={e => { setRenaming({ id: s.id, name: e.target.value }); }} />
            <Button size="xs" type="submit" disabled={actions.rename.isPending}>Save name</Button></form>
          : <div className="flex items-center gap-1">
            <button type="button" className="min-w-0 flex-1 text-left hover:underline" onClick={() => { onLoad(s); }}>
              <span className="block truncate font-semibold">{s.name}</span>
              <span className="text-[11px] text-muted-foreground">{s.spec.universe} · {s.spec.interval}</span></button>
            <Button size="xs" variant="ghost" aria-label={`Rename ${s.name}`} onClick={() => { setRenaming({ id: s.id, name: s.name }); }}>Rename</Button>
            <Button size="xs" variant="ghost" aria-label={`Delete ${s.name}`} disabled={actions.remove.isPending} onClick={() => { actions.remove.mutate(s.id); }}>×</Button></div>}
      </li>)}</ul>}
    {error && <p role="alert" className="mt-1 text-down">{error.message}</p>}
  </aside>;
}
