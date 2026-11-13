import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { HomePage } from '../../features/home';
import { useSession } from '../../features/auth';
import { rootRoute } from './root-route';

const LandingPage = lazyRouteComponent(() => import('../../features/landing'), 'LandingPage');

/** Visitors who are not signed in get the public page; signed-in users get their dashboard. */
function HomeOrLanding() {
  const session = useSession();
  if (session.isPending) return <div role="status" aria-label="Loading" className="flex-1" />;
  return session.isError ? <LandingPage /> : <HomePage />;
}

export const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeOrLanding });
