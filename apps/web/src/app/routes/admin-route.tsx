import { createRoute } from '@tanstack/react-router';
import { AdminPage, ZerodhaCallbackPage } from '../../features/admin/index';
import { rootRoute } from './root-route';

export const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin',
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
    notice: typeof search.notice === 'string' ? search.notice : undefined,
  }), component: AdminPage });
export const zerodhaCallbackRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin/zerodha/callback', component: ZerodhaCallbackPage });
