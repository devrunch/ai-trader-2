import { useCallback, useMemo, useState } from 'react';
import type { Interval, PaperSide } from '@aitrader/contracts';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { SymbolSearchDialog, useOpenOnType } from '../../features/symbol-search';
import { Brand, CompactNav } from '../layout/app-shell';
import { TerminalLayout } from '../layout/terminal-layout';
import { ConnectionIndicator, LiveChart, useDrawingStore } from '../../features/chart';
import { IndicatorPicker, IndicatorTemplatesMenu } from '../../features/indicators';
import { InstrumentBadge, IntervalPicker, Watchlist, useWatchlistEdit } from '../../features/terminal';
import { OrderDialog, TradingPanel } from '../../features/paper';
import { ChatPanel } from '../../features/chat';
import { NewsPanel } from '../../features/news';
import { AlertsPanel } from '../../features/alerts';
import { NotificationBell } from '../../features/notifications';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

// Loaded on first visit to /terminal: the chart library and live client stay out of the initial bundle.
const Divider = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;

export function TerminalPage() {
  const { symbol, interval } = useSearch({ from: '/terminal' });
  const navigate = useNavigate();
  const [initial, setInitial] = useState<string | null>(null);
  const open = useCallback((value: string) => { setInitial((current) => current ?? value); }, []);
  useOpenOnType(open);
  const [ticket, setTicket] = useState<PaperSide | null>(null);
  const [adding, setAdding] = useState(false);
  const watchlist = useWatchlistEdit();
  const addDrawing = useDrawingStore(s => s.add);
  const chatActions = useMemo(() => ({ openSymbol: (next: string, nextInterval?: Interval) => { void navigate({ to: '/terminal', search: { symbol: next, interval: nextInterval ?? interval } }); },
    addDrawing }), [navigate, interval, addDrawing]);
  const toolbar = <div className="flex w-full min-w-0 items-center gap-1 px-2">
    {/* On a phone the group scrolls sideways rather than squeezing the symbol and price over the interval buttons. */}
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] max-lg:[mask-image:linear-gradient(to_right,black_88%,transparent)]">
      <span className="hidden shrink-0 items-center xl:flex"><Brand /><Divider /></span>
      <span className="shrink-0"><InstrumentBadge symbol={symbol} onSymbolClick={() => { open(''); }} /></span><Divider />
      <span className="shrink-0"><IntervalPicker /></span><Divider />
      <span className="shrink-0"><IndicatorPicker /></span><span className="shrink-0"><IndicatorTemplatesMenu /></span>
    </div>
    <div className="flex shrink-0 items-center gap-1"><ConnectionIndicator /><Divider /><NotificationBell onOpenSymbol={chatActions.openSymbol} /><CompactNav /><ThemeToggle /></div>
  </div>;
  return <>
    <TerminalLayout toolbar={toolbar} chart={<LiveChart symbol={symbol} interval={interval} />} bottom={<TradingPanel symbol={symbol} onTrade={setTicket} />}
      widgets={{ watchlist: <Watchlist onAdd={() => { setAdding(true); }} />, assistant: <div className="h-full p-3"><ChatPanel actions={chatActions} /></div>, alerts: <AlertsPanel symbol={symbol} interval={interval} onOpenSymbol={chatActions.openSymbol} />, news: <NewsPanel symbol={symbol} onOpenSymbol={chatActions.openSymbol} /> }} />
    {ticket && <OrderDialog symbol={symbol} side={ticket} onClose={() => { setTicket(null); }} />}
    {adding && <SymbolSearchDialog initial="" onClose={() => { setAdding(false); }} onSelect={(id) => { watchlist.add.mutate(id); }} />}
    {initial !== null && <SymbolSearchDialog initial={initial} onClose={() => { setInitial(null); }} onSelect={(id) => { void navigate({ to: '/terminal', search: { symbol: id, interval } }); }} />}
  </>;
}
