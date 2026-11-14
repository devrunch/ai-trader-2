import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { UIMessage } from 'ai';
import { ChartCandlestick } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { DeskRunListSchema, type Interval } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Wordmark } from '../../shared/ui/brand-mark';
import { ThemeToggle } from '../../shared/ui/theme-toggle';
import { ChatPanel } from '../chat';
import { DeskRunPane } from '../desk';
import { TaskList } from '../alerts';
import { FocusPanel } from './focus-panel';
import { focusFrom } from './focus-symbols';

const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/** Every AI Desk run, newest first, whoever started it; each opens with its full trace. */
function DeskHistory({ open, onOpen }: { open: string | undefined; onOpen: (id: string) => void }) {
  const runs = useQuery({ queryKey: ['desk', 'runs', 'history'], refetchInterval: 30_000,
    queryFn: ({ signal }) => apiFetch('v1/desk/runs?limit=20', { schema: DeskRunListSchema, signal }) });
  const items = runs.data?.items ?? [];
  return <section aria-label="AI Desk history" className="border-t">
    <h3 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Desk runs</h3>
    {items.length === 0 ? <p className="px-3 pb-3 text-sm text-muted-foreground">When the assistant runs the desk for a decision, each run is kept here with what every role said.</p>
      : <ul>{items.map(r => <li key={r.id}>
        <button type="button" aria-current={open === r.id ? 'true' : undefined} onClick={() => { onOpen(r.id); }}
          className={`grid w-full grid-cols-[1fr_auto] gap-x-2 px-3 py-1.5 text-left text-sm hover:bg-muted ${open === r.id ? 'bg-muted' : ''}`}>
          <span className="min-w-0 truncate"><span className="font-semibold">{r.symbol.split(':')[1] ?? r.symbol}</span> <span className="text-muted-foreground">{when.format(Date.parse(r.createdAt))}</span></span>
          <span className={r.status === 'running' ? 'ai-text' : r.decision.action === 'BUY' ? 'text-up' : r.decision.action === 'SELL' ? 'text-down' : 'text-muted-foreground'}>
            {r.status === 'running' ? 'working' : r.decision.action}</span>
        </button></li>)}</ul>}
  </section>;
}

/** The agent window: the conversation (or an open AI Desk run) in the centre, everything the assistant is doing on the left, and the stocks in the conversation on the right. */
export function AgentWindow({ symbol, interval, runId, onOpenRun, onOpenSymbol }: { symbol: string; interval: Interval; runId?: string | undefined;
  onOpenRun: (id: string | undefined) => void; onOpenSymbol: (symbol: string, interval?: Interval) => void }) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const onMessages = useCallback((next: UIMessage[]) => { setMessages(next); }, []);
  const focus = useMemo(() => focusFrom(messages), [messages]);
  const actions = useMemo(() => ({ openSymbol: onOpenSymbol, addDrawing: () => { throw new Error('Open the terminal to draw on the chart'); } }), [onOpenSymbol]);
  return <div className="flex h-dvh flex-col bg-background">
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-panel px-3">
      <Link to="/" aria-label="AI Trader home"><Wordmark /></Link>
      <span className="ai-text text-sm font-semibold">Agent</span>
      <span className="ml-auto flex items-center gap-2">
        <Link to="/terminal" search={{ symbol, interval }} className="inline-flex h-8 items-center gap-1.5 border px-3 text-sm font-medium hover:bg-muted">
          <ChartCandlestick className="size-4" aria-hidden="true" />Back to terminal</Link>
        <ThemeToggle />
      </span>
    </header>
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
      <aside aria-label="Tasks" className="hidden min-h-0 flex-col overflow-y-auto border-r bg-sidebar md:flex">
        <h2 className="px-3 pb-1 pt-3 text-sm font-semibold">Tasks</h2>
        <TaskList onOpenSymbol={s => { onOpenSymbol(s); }} />
        <DeskHistory open={runId} onOpen={onOpenRun} />
      </aside>
      <main className="flex min-h-0 flex-col p-3 md:p-4">
        {runId && <div className="mx-auto w-full max-w-4xl min-h-0 overflow-y-auto"><DeskRunPane runId={runId} onClose={() => { onOpenRun(undefined); }} /></div>}
        <div className={`mx-auto h-full w-full max-w-3xl min-h-0 flex-col ${runId ? 'hidden' : 'flex'}`}>
          <ChatPanel actions={actions} onMessages={onMessages} showTasks={false} />
        </div>
      </main>
      <aside aria-label="Stocks in focus" className="hidden min-h-0 overflow-y-auto border-l bg-panel xl:block">
        <h2 className="border-b px-3 py-2 text-sm font-semibold">In focus</h2>
        <FocusPanel symbols={focus.symbols} views={focus.views} />
      </aside>
    </div>
  </div>;
}
