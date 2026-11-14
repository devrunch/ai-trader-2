import { createRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import { INTERVALS } from '@aitrader/contracts';
import { AgentWindow } from '../../features/agent-window';
import { rootRoute } from './root-route';

const searchSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!\- ]+$/).catch('NSE:NIFTY'),
  interval: z.preprocess((value) => typeof value === 'number' ? String(value) : value, z.enum(INTERVALS).catch('5')),
});

function AgentRoute() {
  const { symbol, interval } = useSearch({ from: '/agent' });
  const navigate = useNavigate();
  return <AgentWindow symbol={symbol} interval={interval}
    onOpenSymbol={(next, nextInterval) => { void navigate({ to: '/terminal', search: { symbol: next, interval: nextInterval ?? interval } }); }} />;
}

/** The agent window: one of the app's two modes, switched with the Terminal's "Switch to agent" button. */
export const agentRoute = createRoute({ getParentRoute: () => rootRoute, path: '/agent', validateSearch: (search) => searchSchema.parse(search), component: AgentRoute });
