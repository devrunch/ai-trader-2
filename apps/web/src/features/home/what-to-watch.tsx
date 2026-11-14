import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Eye, Waves } from 'lucide-react';
import { WhatToWatchResponseSchema, type WatchItem } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { ApiError } from '../../shared/api/api-error';
import { AiButton } from '../../shared/ui/ai-button';
import { Skeleton } from '../../shared/ui/skeleton';
import { formatPct, formatPrice, useQuotes } from '../terminal';

const KEY = ['what-to-watch'];
const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const ticker = (s: string) => s.split(':')[1] ?? s;
const DIRECTION = {
  up: { icon: ArrowUpRight, label: 'Likely up', tone: 'text-up' },
  down: { icon: ArrowDownRight, label: 'Likely down', tone: 'text-down' },
  volatile: { icon: Waves, label: 'Big move either way', tone: 'text-warning' },
  watch: { icon: Eye, label: 'Watch', tone: 'text-muted-foreground' },
} as const;
const OUTCOME = { right: 'Turned out right', wrong: 'Turned out wrong', unclear: 'No clear outcome', open: '' } as const;

function Item({ item, onFollow, following }: { item: WatchItem; onFollow: () => void; following: boolean }) {
  const quotes = useQuotes(item.symbols);
  const d = DIRECTION[item.direction];
  const Icon = d.icon;
  return <li className="space-y-1.5 border-b px-4 py-3 last:border-b-0">
    <div className="flex items-start gap-2">
      <Icon className={`mt-0.5 size-4 shrink-0 ${d.tone}`} aria-label={d.label} />
      <p className="min-w-0 flex-1 font-semibold">{item.title}</p>
      <span className="shrink-0 text-xs text-muted-foreground">{item.horizon === 'today' ? 'Today' : 'This week'} · {Math.round(item.confidence * 100)}% sure</span>
    </div>
    <p className="pl-6 text-sm text-muted-foreground">{item.why}</p>
    <div className="flex flex-wrap items-center gap-2 pl-6 text-sm">
      {item.symbols.map(s => { const q = quotes.data?.get(s); return <span key={s} className="num border px-2 py-0.5">
        <span className="font-semibold">{ticker(s)}</span> {q ? formatPrice(q.price) : ''} {q?.changePct != null && <span className={q.changePct >= 0 ? 'text-up' : 'text-down'}>{formatPct(q.changePct)}</span>}</span>; })}
      {item.outcome !== 'open'
        ? <span className={`ml-auto text-xs font-semibold ${item.outcome === 'right' ? 'text-up' : item.outcome === 'wrong' ? 'text-down' : 'text-muted-foreground'}`}>
          {OUTCOME[item.outcome]}{item.movePct === null ? '' : ` (${item.movePct >= 0 ? '+' : ''}${String(item.movePct)}%)`}</span>
        : item.follow && <span className="ml-auto">{item.taskId
          ? <span className="text-xs text-muted-foreground">Watching {ticker(item.follow.symbol)} {item.follow.op} {formatPrice(item.follow.value)}</span>
          : <AiButton size="sm" disabled={following} onClick={onFollow}>Watch {ticker(item.follow.symbol)} {item.follow.op} {formatPrice(item.follow.value)}</AiButton>}</span>}
    </div>
  </li>;
}

/** The first thing on Home: the assistant's list of what to watch out for, with a reason for each item and how past items turned out. */
export function WhatToWatchCard() {
  const client = useQueryClient();
  const watch = useQuery({ queryKey: KEY, queryFn: ({ signal }) => apiFetch('/v1/what-to-watch', { schema: WhatToWatchResponseSchema, signal }) });
  const refresh = useMutation({ retry: 0, mutationFn: () => apiFetch('/v1/what-to-watch/refresh', { method: 'POST', schema: WhatToWatchResponseSchema, timeoutMs: 120_000 }),
    onSuccess: data => { client.setQueryData(KEY, data); } });
  const follow = useMutation({ mutationFn: (id: string) => apiFetch(`/v1/what-to-watch/items/${id}/follow`, { method: 'POST', schema: WhatToWatchResponseSchema }),
    onSuccess: data => { client.setQueryData(KEY, data); void client.invalidateQueries({ queryKey: ['agent', 'tasks'] }); } });
  const list = watch.data?.list ?? null;
  const record = list?.record;
  const error = refresh.error ?? follow.error;
  return <section aria-label="What to watch" className="ai-border min-w-0">
    <header className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2">
      <h2 className="text-base font-semibold">What to watch</h2>
      {list && <span className="text-xs text-muted-foreground">Updated {time.format(Date.parse(list.createdAt))} IST</span>}
      {record && record.total > 0 && <span className="text-xs text-muted-foreground">Track record: right {record.right} of the last {record.total}</span>}
      <AiButton size="sm" className="ml-auto" disabled={refresh.isPending} onClick={() => { refresh.mutate(); }}>{refresh.isPending ? 'Updating…' : list ? 'Update' : 'Write it now'}</AiButton>
    </header>
    {error && <p role="alert" className="px-4 py-2 text-sm text-down">{error instanceof ApiError ? error.message : 'That did not work; try again in a minute.'}</p>}
    {watch.isPending || refresh.isPending ? <div className={`space-y-2 p-4 ${refresh.isPending ? 'ai-working' : ''}`}><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-5 w-3/5" /></div>
      : !list ? <p className="p-4 text-sm text-muted-foreground">The assistant writes this before the Indian open each weekday, from prices, headlines and today&apos;s events. Write it now to see it.</p>
      : <ul>{list.items.map(item => <Item key={item.id} item={item} following={follow.isPending} onFollow={() => { follow.mutate(item.id); }} />)}</ul>}
  </section>;
}
