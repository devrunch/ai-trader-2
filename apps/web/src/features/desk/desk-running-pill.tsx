import { Link } from '@tanstack/react-router';
import { useRunningDesk } from './use-desk';

/** Shown in the header on every page while a desk run is working; it opens the run in the agent window. */
export function DeskRunningPill({ enabled }: { enabled: boolean }) {
  const running = useRunningDesk(enabled);
  const run = running.data?.[0];
  if (!run) return null;
  const more = (running.data?.length ?? 1) - 1;
  return <Link to="/agent" search={{ symbol: run.symbol, interval: '5', run: run.id }} role="status"
    className="ai-border ai-working hidden h-8 items-center gap-2 px-3 text-sm font-medium sm:inline-flex">
    <span aria-hidden="true" className="size-2 animate-pulse rounded-full ai-gradient" />
    AI Desk working on {run.symbol.split(':')[1] ?? run.symbol}{more > 0 ? ` +${String(more)}` : ''}
  </Link>;
}
