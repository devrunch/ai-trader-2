import { createRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { TerminalLayout } from '../layout/terminal-layout';
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
  return <TerminalLayout watchlist={<Placeholder title="Watchlist" />} chart={<div className="space-y-4"><div className="flex items-baseline gap-3"><h1 className="text-lg font-semibold">{symbol}</h1><span className="rounded border px-2 py-1 text-sm">{interval}</span></div><Placeholder title="Chart" /></div>} side={{ chat: <Placeholder title="Chat" />, positions: <Placeholder title="Positions" />, news: <Placeholder title="News" />, alerts: <Placeholder title="Alerts" /> }} />;
}
export const terminalRoute = createRoute({ getParentRoute: () => rootRoute, path: '/terminal', validateSearch: (search) => searchSchema.parse(search), component: Terminal });
