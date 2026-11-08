import type { InstrumentSummary } from '@aitrader/contracts';
import { CommandGroup, CommandItem } from '../../shared/ui/command';
import { Skeleton } from '../../shared/ui/skeleton';
import { ApiError } from '../../shared/api/api-error';
import type { useSymbolSearch } from './use-symbol-search';

type Props = { query: ReturnType<typeof useSymbolSearch>; q: string; recents: string[]; onSelect: (id: string) => void };
function Result({ instrument, onSelect }: { instrument: InstrumentSummary; onSelect: (id: string) => void }) {
  return <CommandItem value={instrument.id} onSelect={onSelect}><div className="flex justify-between gap-3"><span className="font-medium">{instrument.id}</span><span className="rounded border px-2 text-xs">{instrument.exchange}</span></div><div className="flex justify-between gap-3 text-sm text-muted-foreground"><span>{instrument.description}</span><span>{instrument.type}</span></div></CommandItem>;
}
export function SymbolSearchResults({ query, q, recents, onSelect }: Props) {
  if (query.isError) return <div role="alert" className="space-y-2 p-3"><p>Couldn't search right now</p><p>{query.error instanceof ApiError ? query.error.code : 'INTERNAL'}</p><button onClick={() => { void query.refetch(); }}>Retry</button></div>;
  return <>
    {q === '' && recents.length > 0 && <CommandGroup heading="Recent symbols">{recents.map((id) => <CommandItem key={id} value={`recent:${id}`} onSelect={() => { onSelect(id); }}>{id}</CommandItem>)}</CommandGroup>}
    {query.isPending ? <div aria-label="Loading symbols" className="space-y-2 p-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : <>
      {query.isFetching && <div role="progressbar" aria-label="Refreshing symbols" className="h-0.5 animate-pulse bg-primary" />}
      {query.data.results.length === 0 ? <p className="p-3 text-muted-foreground">No matches for "{q}"</p> : <CommandGroup heading={q === '' ? 'Popular symbols' : 'Results'}>{query.data.results.map((instrument) => <Result key={instrument.id} instrument={instrument} onSelect={onSelect} />)}</CommandGroup>}
    </>}
  </>;
}
