import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { NewsResponseSchema, type NewsItemFull, type Sentiment } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';

const ago = (iso: string, now: number): string => {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${String(minutes)}m`;
  if (minutes < 1440) return `${String(Math.round(minutes / 60))}h`;
  return `${String(Math.round(minutes / 1440))}d`;
};
const short = (symbol: string) => symbol.slice(symbol.indexOf(':') + 1);
const IMPACT = { high: ['High impact', 'bg-down'], medium: ['Medium impact', 'bg-warning'], low: ['Low impact', 'bg-muted-foreground'] } as const;
const ARROW = { up: ['▲', 'likely up', 'text-up'], down: ['▼', 'likely down', 'text-down'], unclear: ['–', 'direction unclear', 'text-muted-foreground'] } as const;
const moveLabel = (m: string) => (m.includes(':') ? short(m) : m);

const SENTIMENT = { bullish: ['Bullish', 'text-up'], bearish: ['Bearish', 'text-down'], neutral: ['Neutral', 'text-muted-foreground'] } as const;

function SentimentBadge({ sentiment }: { sentiment: Sentiment | null | undefined }) {
  if (!sentiment) return null;
  const [label, tone] = SENTIMENT[sentiment.label];
  return <span className={`num ${tone}`} title={`Sentiment score ${String(sentiment.score)} (${sentiment.by})`}>{label} {sentiment.score > 0 ? '+' : ''}{sentiment.score.toFixed(2)}</span>;
}

function Moves({ item }: { item: NewsItemFull }) {
  if (item.moves.length === 0) return null;
  const arrow = item.direction ? ARROW[item.direction] : null;
  return <p className="text-xs text-muted-foreground">
    <span>Moves: {item.moves.map(moveLabel).join(', ')}</span>
    {arrow && <span role="img" aria-label={arrow[1]} className={`ml-1 ${arrow[2]}`}>{arrow[0]}</span>}
  </p>;
}

/** Market headlines from public feeds, grouped into stories with their source count, or Reddit crowd chatter (labelled, never news). */
export function NewsPanel({ symbol, onOpenSymbol }: { symbol: string; onOpenSymbol: (symbol: string) => void }) {
  const [scope, setScope] = useState<'all' | 'symbol' | 'crowd'>('all');
  const [highOnly, setHighOnly] = useState(false);
  const news = useQuery({ queryKey: ['news', scope === 'symbol' ? symbol : scope, highOnly ? 'high' : 'any'], refetchInterval: 120_000,
    queryFn: ({ signal }) => apiFetch(`/v1/news?limit=60&hours=72${scope === 'crowd' ? '&crowd=true' : '&clustered=true'}${scope === 'symbol' ? `&symbol=${encodeURIComponent(symbol)}` : ''}${highOnly ? '&minImpact=high' : ''}`, { schema: NewsResponseSchema, signal }) });
  const now = news.dataUpdatedAt;
  const rows = news.data?.clusters ? news.data.clusters.map(c => ({ item: c.lead, sources: c.sourceCount, sentiment: c.sentiment })) : (news.data?.items ?? []).map(item => ({ item, sources: 1, sentiment: item.sentiment }));
  return <div className="flex h-full flex-col text-sm">
    <div role="tablist" aria-label="News scope" className="flex shrink-0 gap-1 border-b px-2">
      {(['all', 'symbol', 'crowd'] as const).map(s => <button key={s} type="button" role="tab" aria-selected={scope === s} onClick={() => { setScope(s); }}
        className={`h-8 border-b-2 px-2 ${scope === s ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
        {s === 'all' ? 'All markets' : s === 'crowd' ? 'Crowd' : short(symbol)}</button>)}
      <button type="button" aria-pressed={highOnly} onClick={() => { setHighOnly(v => !v); }}
        className={`my-1 ml-auto border px-2 ${highOnly ? 'border-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>High only</button>
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      {news.isPending && <p className="p-3 text-muted-foreground">Loading headlines…</p>}
      {news.isError && <p role="alert" className="p-3 text-down">Headlines are unavailable right now.</p>}
      {news.data && rows.length === 0 && <p className="p-3 text-muted-foreground">{scope === 'crowd' ? 'No crowd chatter yet; Reddit is read every 10 minutes.' : scope === 'symbol' ? `No recent headlines mention ${short(symbol)}.` : 'No headlines yet; feeds refresh every 5 minutes.'}</p>}
      {scope === 'crowd' && rows.length > 0 && <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">Crowd chatter from Reddit: opinion from traders, not reporting.</p>}
      <ul>{rows.map(({ item, sources, sentiment }) => <li key={item.id} className="space-y-1 border-b px-3 py-2 hover:bg-muted/50">
        <div className="flex gap-2 text-xs text-muted-foreground"><span>{item.source}</span><span>·</span><time dateTime={item.publishedAt}>{ago(item.publishedAt, now)}</time>
          {sources > 1 && <><span>·</span><span className="font-semibold text-foreground">{sources} sources</span></>}
          {item.crowd && <><span>·</span><span className="border px-1">Crowd</span></>}
          {sentiment && <><span>·</span><SentimentBadge sentiment={sentiment} /></>}</div>
        <div className="flex items-start gap-2">
          <span role="img" aria-label={IMPACT[item.impact][0]} title={IMPACT[item.impact][0]} className={`mt-1.5 size-2 shrink-0 rounded-full ${IMPACT[item.impact][1]}`} />
          <a href={item.url} target="_blank" rel="noreferrer noopener" className="block font-semibold leading-snug hover:underline">{item.title}</a>
        </div>
        <Moves item={item} />
        {item.summary && <p className="line-clamp-2 text-muted-foreground">{item.summary}</p>}
        {item.symbols.length > 0 && <div className="flex flex-wrap gap-1">{item.symbols.map(s => <button key={s} type="button" onClick={() => { onOpenSymbol(s); }}
          className="border px-1.5 text-xs text-link hover:bg-muted">{short(s)}</button>)}</div>}
      </li>)}</ul>
    </div>
  </div>;
}
