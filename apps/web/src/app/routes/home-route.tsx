import { createRoute } from '@tanstack/react-router';
import { HomePage } from '../../features/home';
import { rootRoute } from './root-route';

export const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
