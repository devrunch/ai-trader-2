import { createRoute } from '@tanstack/react-router';
import { PortfolioPage } from '../../features/portfolio';
import { rootRoute } from './root-route';

export const portfolioRoute = createRoute({ getParentRoute: () => rootRoute, path: '/portfolio', component: PortfolioPage });
