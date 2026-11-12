import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';
import { INTERVALS } from '@aitrader/contracts';
import { rootRoute } from './root-route';
const searchSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!\- ]+$/).catch('NSE:NIFTY'),
  interval: z.preprocess((value) => typeof value === 'number' ? String(value) : value, z.enum(INTERVALS).catch('5')),
  panel: z.enum(['watchlist', 'assistant', 'alerts', 'news']).optional().catch(undefined),
});
export const terminalRoute = createRoute({ getParentRoute: () => rootRoute, path: '/terminal', validateSearch: (search) => searchSchema.parse(search),
  component: lazyRouteComponent(() => import('./terminal-page'), 'TerminalPage') });
