import { createRoute } from '@tanstack/react-router';
import { Skeleton } from '../../shared/ui/skeleton';
import { rootRoute } from './root-route';
function Home() {
  return <div className="space-y-6 p-6"><h1 className="text-2xl font-semibold">Home</h1>
    <p className="text-muted-foreground">Your trading workspace. Open Terminal to begin.</p>
    <div aria-label="Workspace preview" className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((id) => <div key={id} className="space-y-4 rounded-lg border bg-panel p-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-24 w-full" /></div>)}</div>
  </div>;
}
export const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home });
