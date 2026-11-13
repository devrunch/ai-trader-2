import { createRoute, useNavigate } from '@tanstack/react-router';
import { ScreenerPage } from '../../features/screener';
import { rootRoute } from './root-route';

function ScreenerRoute() {
  const navigate = useNavigate();
  return <ScreenerPage onOpen={(symbol, interval) => { void navigate({ to: '/terminal', search: { symbol, interval } }); }} />;
}

export const screenerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/screener', component: ScreenerRoute });
