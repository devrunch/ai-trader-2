import { useCallback, useMemo, useState } from 'react';
import type { Interval } from '@aitrader/contracts';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { SymbolSearchDialog, useOpenOnType } from '../../features/symbol-search';
import { TerminalLayout } from '../layout/terminal-layout';
import { ConnectionIndicator, LiveChart } from '../../features/chart';
import { IntervalPicker, SymbolHeader, Watchlist } from '../../features/terminal';
import { PositionsPanel } from '../../features/paper';
import { ChatPanel } from '../../features/chat';

// Loaded on first visit to /terminal: the chart library and live client stay out of the initial bundle.
function Placeholder({ title }: { title: string }) {
  return <div className="space-y-3"><h2 className="font-medium">{title}</h2><p className="text-sm text-muted-foreground">No content yet. This workspace is ready for future features.</p></div>;
}
export function TerminalPage() {
  const { symbol, interval } = useSearch({ from: '/terminal' });
  const navigate = useNavigate();
  const [initial, setInitial] = useState<string | null>(null);
  const open = useCallback((value: string) => { setInitial((current) => current ?? value); }, []);
  useOpenOnType(open);
  const chatActions = useMemo(() => ({ openSymbol: (next: string, nextInterval?: Interval) => { void navigate({ to: '/terminal', search: { symbol: next, interval: nextInterval ?? interval } }); } }), [navigate, interval]);
  return <><TerminalLayout watchlist={<Watchlist />} chart={<div className="flex h-full flex-col gap-3"><div className="flex flex-wrap items-center gap-3"><SymbolHeader symbol={symbol} onSymbolClick={() => { open(''); }} /><IntervalPicker /><span className="ml-auto"><ConnectionIndicator /></span></div><div className="min-h-0 flex-1"><LiveChart symbol={symbol} interval={interval} /></div></div>} side={{ chat: <ChatPanel actions={chatActions} />, positions: <PositionsPanel symbol={symbol} />, news: <Placeholder title="News" />, alerts: <Placeholder title="Alerts" /> }} />
    {initial !== null && <SymbolSearchDialog initial={initial} onClose={() => { setInitial(null); }} onSelect={(id) => { void navigate({ to: '/terminal', search: { symbol: id, interval } }); }} />}
  </>;
}
