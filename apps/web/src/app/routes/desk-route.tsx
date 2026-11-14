import { createRoute, Navigate, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import { rootRoute } from './root-route';

const searchSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/).catch('NSE:NIFTY'),
  run: z.uuid().optional().catch(undefined),
});

/** The AI Desk lives in the agent window; old links (notifications, emails) to /desk open the same run there. */
function DeskRedirect() {
  const { symbol, run } = useSearch({ from: '/desk' });
  return <Navigate to="/agent" search={{ symbol, interval: '5', run }} replace />;
}

export const deskRoute = createRoute({ getParentRoute: () => rootRoute, path: '/desk', validateSearch: (search) => searchSchema.parse(search), component: DeskRedirect });
