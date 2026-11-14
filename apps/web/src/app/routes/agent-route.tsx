import { createRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { AgentWindow } from '../../features/agent-window';
import { rootRoute } from './root-route';
import { symbolSearch } from './symbol-search';

function AgentRoute() {
  const { symbol, interval } = useSearch({ from: '/agent' });
  const navigate = useNavigate();
  return <AgentWindow symbol={symbol} interval={interval}
    onOpenSymbol={(next, nextInterval) => { void navigate({ to: '/terminal', search: { symbol: next, interval: nextInterval ?? interval } }); }} />;
}

/** The agent window: one of the app's two modes, switched with the Terminal's "Switch to agent" button. */
export const agentRoute = createRoute({ getParentRoute: () => rootRoute, path: '/agent', validateSearch: (search) => symbolSearch.parse(search), component: AgentRoute });
