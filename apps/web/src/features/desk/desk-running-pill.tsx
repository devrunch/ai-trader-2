import { Link } from '@tanstack/react-router';
import { useRunningDesk } from './use-desk';

/** Shown in the header on every page while a desk run is working, so a run started on the Desk page is never out of sight. */
export function DeskRunningPill({ enabled }: { enabled: boolean }) {
  const running = useRunningDesk(enabled);
  const run = running.data?.[0];
  if (!run) return null;
  const more = (running.data?.length ?? 1) - 1;
  return <Link to="/desk" search={{ symbol: run.symbol, run: run.id }} role="status"
    className="ai-border ai-working hidden h-8 items-center gap-2 px-3 text-sm font-medium sm:inline-flex">
    <span aria-hidden="true" className="size-2 animate-pulse rounded-full ai-gradient" />
    AI Desk working on {run.symbol.split(':')[1] ?? run.symbol}{more > 0 ? ` +${String(more)}` : ''}
  </Link>;
}
