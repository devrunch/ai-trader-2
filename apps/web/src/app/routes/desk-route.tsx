import { createRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import { DeskPage } from '../../features/desk';
import { rootRoute } from './root-route';

const searchSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/).catch('NSE:NIFTY'),
  run: z.uuid().optional().catch(undefined),
});

/** The open run lives in the address, so leaving the page and coming back (or a refresh) shows it again. */
function DeskRoute() {
  const { symbol, run } = useSearch({ from: '/desk' });
  const navigate = useNavigate();
  return <DeskPage symbol={symbol} runId={run}
    onSymbol={next => { void navigate({ to: '/desk', search: { symbol: next }, replace: true }); }}
    onOpenRun={(id, runSymbol) => { void navigate({ to: '/desk', search: { symbol: runSymbol ?? symbol, run: id } }); }} />;
}

export const deskRoute = createRoute({ getParentRoute: () => rootRoute, path: '/desk', validateSearch: (search) => searchSchema.parse(search), component: DeskRoute });
