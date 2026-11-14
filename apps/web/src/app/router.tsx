import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { rootRoute } from './routes/root-route';
import { homeRoute } from './routes/home-route';
import { terminalRoute } from './routes/terminal-route';
import { loginRoute } from './routes/login-route';
import { strategiesRoute } from './routes/strategies-route';
import { deskRoute } from './routes/desk-route';
import { agentRoute } from './routes/agent-route';
import { portfolioRoute } from './routes/portfolio-route';
import { screenerRoute } from './routes/screener-route';
import { adminRoute, zerodhaCallbackRoute } from './routes/admin-route';
const routeTree = rootRoute.addChildren([homeRoute, terminalRoute, agentRoute, portfolioRoute, strategiesRoute, screenerRoute, deskRoute, loginRoute, adminRoute, zerodhaCallbackRoute]);
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, ...(history ? { history } : {}),
    parseSearch: (search) => Object.fromEntries(new URLSearchParams(search)),
    stringifySearch: (search) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(search)) if (value !== undefined) params.set(key, String(value));
      const result = params.toString();
      return result ? `?${result}` : '';
    },
  });
}
declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof createAppRouter> }
}
