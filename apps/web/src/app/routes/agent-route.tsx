import { createRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import { AgentWindow } from '../../features/agent-window';
import { rootRoute } from './root-route';
import { symbolSearch } from './symbol-search';

/** The open AI Desk run is in the address too, so a refresh or a link from a notification shows it. */
const agentSearch = symbolSearch.extend({ run: z.uuid().optional().catch(undefined) });

function AgentRoute() {
  const { symbol, interval, run } = useSearch({ from: '/agent' });
  const navigate = useNavigate();
  return <AgentWindow symbol={symbol} interval={interval} runId={run}
    onOpenRun={id => { void navigate({ to: '/agent', search: { symbol, interval, run: id } }); }}
    onOpenSymbol={(next, nextInterval) => { void navigate({ to: '/terminal', search: { symbol: next, interval: nextInterval ?? interval } }); }} />;
}

/** The agent window: one of the app's two modes, switched with the Terminal's "Switch to agent" button. */
export const agentRoute = createRoute({ getParentRoute: () => rootRoute, path: '/agent', validateSearch: (search) => agentSearch.parse(search), component: AgentRoute });
