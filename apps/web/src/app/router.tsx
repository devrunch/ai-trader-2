import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { rootRoute } from './routes/root-route';
import { homeRoute } from './routes/home-route';
import { terminalRoute } from './routes/terminal-route';
const routeTree = rootRoute.addChildren([homeRoute, terminalRoute]);
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, ...(history ? { history } : {}) });
}
declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof createAppRouter> }
}
