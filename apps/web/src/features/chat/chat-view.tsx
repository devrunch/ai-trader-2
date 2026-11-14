import { useMutation, useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { BarsResponseSchema, ViewActionSchema, type ChatView, type CustomView, type ViewAction, type ViewBlock } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { useChatActions } from './chat-actions';
import { ChatMarkdown } from './markdown';

/** Lets a reply's button send a follow-up message in the same conversation. */
export const ChatAskContext = createContext<((text: string) => void) | null>(null);

const TONE = { up: 'text-up', down: 'text-down', warning: 'text-warning', neutral: '' } as const;
const ticker = (s: string) => s.split(':')[1] ?? s;

/** Runs one of the few actions a reply may ask for, through the same paths as the rest of the app. */
function useViewAction() {
  const host = useChatActions();
  const ask = useContext(ChatAskContext);
  const alert = useMutation({ mutationFn: (a: Extract<ViewAction, { type: 'set-alert' }>) => apiFetch('/v1/agent/tasks/alerts', { method: 'POST', schema: z.unknown(),
    body: { trigger: { kind: 'price', symbol: a.symbol, op: a.op, value: a.value }, repeat: false, note: 'Set from a reply' } }) });
  const run = (a: ViewAction) => {
    if (a.type === 'open-symbol') host.openSymbol(a.symbol, a.interval);
    else if (a.type === 'set-alert') alert.mutate(a);
    else ask?.(a.text);
  };
  return { run, alert };
}

function MiniChart({ block }: { block: Extract<ViewBlock, { kind: 'chart' }> }) {
  const bars = useQuery({ queryKey: ['view-chart', block.symbol, block.interval, block.bars], staleTime: 300_000,
    queryFn: ({ signal }) => apiFetch(`v1/bars?symbol=${encodeURIComponent(block.symbol)}&interval=${block.interval}&limit=${String(block.bars)}`, { schema: BarsResponseSchema, signal }) });
  const closes = (bars.data?.bars ?? []).map(b => b.close);
  const prices = [...closes, ...block.levels.map(l => l.price)];
  if (closes.length < 2) return <div className="h-32 border text-sm text-muted-foreground"><p className="p-3">{bars.isPending ? 'Loading chart…' : 'No bars for this chart.'}</p></div>;
  const lo = Math.min(...prices); const hi = Math.max(...prices); const W = 600; const H = 140;
  const y = (p: number) => H - ((p - lo) / (hi - lo || 1)) * (H - 10) - 5;
  const path = closes.map((c, i) => `${i === 0 ? 'M' : 'L'}${String((i / (closes.length - 1)) * W)},${String(y(c))}`).join(' ');
  const last = closes.at(-1) ?? 0; const first = closes[0] ?? 0;
  return <figure className="border p-2">
    <figcaption className="mb-1 flex items-baseline gap-2 text-sm"><span className="font-semibold">{ticker(block.symbol)}</span><span className="text-muted-foreground">{block.interval} · {closes.length} bars</span>
      <span className={`num ml-auto ${last >= first ? 'text-up' : 'text-down'}`}>{last.toLocaleString('en-IN')}</span></figcaption>
    <svg viewBox={`0 0 ${String(W)} ${String(H)}`} className="h-32 w-full" role="img" aria-label={`${ticker(block.symbol)} price chart`}>
      {block.levels.map(l => <g key={l.label}><line x1="0" x2={W} y1={y(l.price)} y2={y(l.price)} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth="1" />
        <text x={W - 4} y={y(l.price) - 3} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{l.label} {l.price.toLocaleString('en-IN')}</text></g>)}
      <path d={path} fill="none" stroke={last >= first ? 'var(--up)' : 'var(--down)'} strokeWidth="1.5" />
    </svg>
  </figure>;
}

function Block({ block }: { block: ViewBlock }) {
  const { run, alert } = useViewAction();
  switch (block.kind) {
    case 'heading': return <h3 className="text-base font-semibold">{block.text}</h3>;
    case 'text': return <ChatMarkdown text={block.markdown} />;
    case 'callout': return <div className={`border-l-2 p-3 ${block.tone === 'down' ? 'border-l-down bg-down/5' : block.tone === 'up' ? 'border-l-up bg-up/5' : 'border-l-warning bg-muted'}`}>
      <p className="font-semibold">{block.title}</p><p className="text-sm text-muted-foreground">{block.text}</p></div>;
    case 'figures': return <section>{block.title && <h4 className="mb-1 text-sm font-semibold">{block.title}</h4>}
      <dl className="grid grid-cols-2 gap-px border bg-border sm:grid-cols-3">{block.items.map(f => <div key={f.label} className="bg-panel p-2">
        <dt className="text-xs text-muted-foreground">{f.label}</dt><dd className={`num text-base font-semibold ${f.tone ? TONE[f.tone] : ''}`}>{f.value}</dd>
        {f.note && <dd className="text-xs text-muted-foreground">{f.note}</dd>}</div>)}</dl></section>;
    case 'table': return <section className="overflow-x-auto">{block.title && <h4 className="mb-1 text-sm font-semibold">{block.title}</h4>}
      <table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr className="border-b">{block.columns.map(c => <th key={c} className="px-2 py-1 font-medium">{c}</th>)}</tr></thead>
        <tbody className="num">{block.rows.map((r, i) => <tr key={i} className="border-b last:border-b-0">{r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}</tr>)}</tbody></table></section>;
    case 'compare': return <section className="overflow-x-auto">{block.title && <h4 className="mb-1 text-sm font-semibold">{block.title}</h4>}
      <table className="w-full text-sm"><thead><tr className="border-b"><th />{block.symbols.map(s => <th key={s} className="px-2 py-1 text-right font-semibold">{ticker(s)}</th>)}</tr></thead>
        <tbody className="num">{block.metrics.map(m => <tr key={m.label} className="border-b last:border-b-0"><td className="px-2 py-1 text-muted-foreground">{m.label}</td>
          {block.symbols.map((s, i) => <td key={s} className="px-2 py-1 text-right">{m.values[i] ?? '—'}</td>)}</tr>)}</tbody></table></section>;
    case 'chart': return <MiniChart block={block} />;
    case 'actions': return <div className="flex flex-wrap gap-1.5">{block.buttons.map(b => <Button key={b.label} size="sm" variant="outline" disabled={alert.isPending}
      onClick={() => { run(b.action); }}>{b.label}</Button>)}{alert.isSuccess && <span className="self-center text-xs text-muted-foreground">Alert set.</span>}</div>;
  }
}

/** A reply built from blocks: the assistant decides the layout, the app draws it. */
export function ChatViewCard({ view }: { view: ChatView }) {
  return <article className="ai-border space-y-3 p-3" aria-label={view.title ?? 'Assistant view'}>
    {view.title && <h3 className="font-semibold">{view.title}</h3>}
    {view.blocks.map((b, i) => <Block key={i} block={b} />)}
  </article>;
}

const FRAME_SCRIPT = `<script>window.VIEW_DATA=__DATA__;window.requestAction=function(a){parent.postMessage({source:'ai-trader-view',action:a},'*');};</script>`;

/** A view the assistant wrote itself, in a sandbox: scripts run, but it has no access to the session, cookies, storage or network of the app. */
export function CustomViewFrame({ view }: { view: CustomView }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [pending, setPending] = useState<ViewAction | null>(null);
  const { run } = useViewAction();
  const srcDoc = useMemo(() => {
    const data = JSON.stringify(view.data).replace(/</g, '\\u003c');
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">`;
    return `<!doctype html><html><head>${csp}${FRAME_SCRIPT.replace('__DATA__', data)}</head><body>${view.html}</body></html>`;
  }, [view]);
  useEffect(() => {
    const onMessage = (e: MessageEvent<unknown>) => {
      if (e.source !== frame.current?.contentWindow) return;
      const msg = e.data as { source?: string; action?: unknown } | null;
      const parsed = msg?.source === 'ai-trader-view' ? ViewActionSchema.safeParse(msg.action) : null;
      if (parsed?.success) setPending(parsed.data);
    };
    window.addEventListener('message', onMessage);
    return () => { window.removeEventListener('message', onMessage); };
  }, []);
  const describe = (a: ViewAction) => (a.type === 'open-symbol' ? `open ${ticker(a.symbol)}` : a.type === 'set-alert' ? `set an alert on ${ticker(a.symbol)} ${a.op} ${String(a.value)}` : `send "${a.text}"`);
  return <figure className="ai-border space-y-2 p-2">
    <figcaption className="px-1 text-sm font-semibold">{view.title}</figcaption>
    <iframe ref={frame} title={view.title} sandbox="allow-scripts" srcDoc={srcDoc} style={{ height: view.height }} className="w-full border-0 bg-background" />
    {pending && <div role="alert" className="flex flex-wrap items-center gap-2 border-t px-1 pt-2 text-sm">
      <span>This view wants to {describe(pending)}.</span>
      <Button size="xs" onClick={() => { run(pending); setPending(null); }}>Do it</Button>
      <Button size="xs" variant="ghost" onClick={() => { setPending(null); }}>Ignore</Button>
    </div>}
  </figure>;
}
