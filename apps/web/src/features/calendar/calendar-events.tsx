import { useQuery } from '@tanstack/react-query';
import { CalendarResponseSchema } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import { EventRow } from './event-row';

/** The next days' releases (medium impact and above) with results, surprises and market reactions as they arrive. */
export function CalendarEvents() {
  const events = useQuery({ queryKey: ['calendar', 3], refetchInterval: 600_000,
    queryFn: ({ signal }) => apiFetch('v1/calendar?days=3&impact=Medium', { schema: CalendarResponseSchema, signal }) });
  if (events.isPending) return <Skeleton className="h-24" />;
  if (events.isError) return <p role="alert" className="text-down">Calendar unavailable. <Button variant="link" size="xs" onClick={() => { void events.refetch(); }}>Retry</Button></p>;
  if (events.data.events.length === 0) return <p className="text-muted-foreground">No medium or high impact releases in the next three days.</p>;
  return <ul aria-label="Upcoming releases" className="divide-y">{events.data.events.slice(0, 14).map(e => <EventRow key={e.id} event={e} />)}</ul>;
}
