import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { rootRoute } from './routes/root-route';
import { homeRoute } from './routes/home-route';
import { terminalRoute } from './routes/terminal-route';
const routeTree = rootRoute.addChildren([homeRoute, terminalRoute]);
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
