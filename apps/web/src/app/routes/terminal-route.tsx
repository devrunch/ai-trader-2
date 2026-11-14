import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';
import { rootRoute } from './root-route';
import { symbolSearch } from './symbol-search';
const searchSchema = symbolSearch.extend({
  panel: z.enum(['watchlist', 'assistant', 'alerts', 'news', 'options']).optional().catch(undefined),
});
export const terminalRoute = createRoute({ getParentRoute: () => rootRoute, path: '/terminal', validateSearch: (search) => searchSchema.parse(search),
  component: lazyRouteComponent(() => import('./terminal-page'), 'TerminalPage') });
