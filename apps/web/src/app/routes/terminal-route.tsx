import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';
import { rootRoute } from './root-route';
const searchSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!\- ]+$/).catch('NSE:NIFTY'),
  interval: z.preprocess((value) => typeof value === 'number' ? String(value) : value, z.enum(['1', '3', '5', '15', '30', '60', '240', '1D', '1W', '1M']).catch('5')),
});
export const terminalRoute = createRoute({ getParentRoute: () => rootRoute, path: '/terminal', validateSearch: (search) => searchSchema.parse(search),
  component: lazyRouteComponent(() => import('./terminal-page'), 'TerminalPage') });
