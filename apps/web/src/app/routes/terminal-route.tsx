import { createRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { useCallback, useState } from 'react';
import { SymbolSearchDialog, useOpenOnType } from '../../features/symbol-search';
import { TerminalLayout } from '../layout/terminal-layout';
import { ConnectionIndicator, LiveChart } from '../../features/chart';
import { IntervalPicker, SymbolHeader, Watchlist } from '../../features/terminal';
import { rootRoute } from './root-route';
const searchSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!\- ]+$/).catch('NSE:NIFTY'),
  interval: z.preprocess((value) => typeof value === 'number' ? String(value) : value, z.enum(['1', '3', '5', '15', '30', '60', '240', '1D', '1W', '1M']).catch('5')),
});
function Placeholder({ title }: { title: string }) {
  return <div className="space-y-3"><h2 className="font-medium">{title}</h2><p className="text-sm text-muted-foreground">No content yet. This workspace is ready for future features.</p></div>;
}
function Terminal() {
  const { symbol, interval } = terminalRoute.useSearch();
  const navigate = terminalRoute.useNavigate();
  const [initial, setInitial] = useState<string | null>(null);
  const open = useCallback((value: string) => { setInitial((current) => current ?? value); }, []);
  useOpenOnType(open);
  return <><TerminalLayout watchlist={<Watchlist />} chart={<div className="flex h-full flex-col gap-3"><div className="flex flex-wrap items-center gap-3"><SymbolHeader symbol={symbol} onSymbolClick={() => { open(''); }} /><IntervalPicker /><span className="ml-auto"><ConnectionIndicator /></span></div><div className="min-h-0 flex-1"><LiveChart symbol={symbol} interval={interval} /></div></div>} side={{ chat: <Placeholder title="Chat" />, positions: <Placeholder title="Positions" />, news: <Placeholder title="News" />, alerts: <Placeholder title="Alerts" /> }} />
    {initial !== null && <SymbolSearchDialog initial={initial} onClose={() => { setInitial(null); }} onSelect={(id) => { void navigate({ to: '/terminal', search: (prev) => ({ ...prev, symbol: id }) }); }} />}
  </>;
}
export const terminalRoute = createRoute({ getParentRoute: () => rootRoute, path: '/terminal', validateSearch: (search) => searchSchema.parse(search), component: Terminal });
