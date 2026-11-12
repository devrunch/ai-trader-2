import { createRoute } from '@tanstack/react-router';
import { StrategiesPage } from '../../features/strategies';
import { rootRoute } from './root-route';

export const strategiesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/strategies', component: StrategiesPage });
