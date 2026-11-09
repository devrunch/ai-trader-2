import { createRoute } from '@tanstack/react-router';
import { LoginPage } from '../../features/auth/index';
import { rootRoute } from './root-route';
export const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', validateSearch: (search: Record<string, unknown>) => ({ redirect: typeof search.redirect === 'string' ? search.redirect : undefined }), component: LoginPage });
