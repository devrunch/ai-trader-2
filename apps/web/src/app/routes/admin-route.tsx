import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

const admin = () => import('../../features/admin/index');
import { rootRoute } from './root-route';

export const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin',
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
    notice: typeof search.notice === 'string' ? search.notice : undefined,
  }), component: lazyRouteComponent(admin, 'AdminPage') });
export const zerodhaCallbackRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin/zerodha/callback', component: lazyRouteComponent(admin, 'ZerodhaCallbackPage') });
