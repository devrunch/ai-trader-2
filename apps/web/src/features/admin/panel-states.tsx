import type { ReactNode } from 'react';
import { Skeleton } from '../../shared/ui/skeleton';
import { Button } from '../../shared/ui/button';
import { ApiError } from '../../shared/api/api-error';

type Tone = 'up' | 'down' | 'warning' | 'muted';
const toneClass: Record<Tone, string> = {
  up: 'border-up/40 text-up', down: 'border-down/40 text-down', warning: 'border-warning/40 text-warning', muted: 'text-muted-foreground',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span data-tone={tone} className={`inline-block rounded border px-1.5 text-xs font-medium ${toneClass[tone]}`}>{children}</span>;
}

/** Loading, error (with the reason and a retry) and empty states shared by every admin view (FR-UI-6/7). */
export function PanelState<T>({ query, isEmpty, empty, children }: {
  query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  isEmpty?: (data: T) => boolean; empty?: string; children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <div role="status" aria-label="Loading" className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /><Skeleton className="h-5 w-3/5" /></div>;
  if (query.isError || query.data === undefined) {
    const reason = query.error instanceof ApiError ? query.error.message : 'Unable to load';
    return <div role="alert" className="flex items-center gap-3 text-sm"><span className="text-down">{reason}</span><Button size="xs" variant="outline" onClick={() => { void query.refetch(); }}>Retry</Button></div>;
  }
  if (isEmpty?.(query.data)) return <p className="text-sm text-muted-foreground">{empty ?? 'Nothing to show.'}</p>;
  return children(query.data);
}

const ist = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
export const formatIst = (iso: string): string => `${ist.format(new Date(iso))} IST`;

export function relative(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${String(Math.round(seconds / 60))} min ago`;
  if (seconds < 86_400) return `${String(Math.round(seconds / 3600))} h ago`;
  return `${String(Math.round(seconds / 86_400))} d ago`;
}
