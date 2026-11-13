import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { EmailPrefSchema, NotificationsResponseSchema } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';

const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const key = ['notifications'] as const;
const EmailPref = z.object({ reports: z.boolean(), address: z.string().nullable(), available: z.boolean() });

/** Opt in to getting watch REPORTs by email at the login address. */
function EmailToggle() {
  const client = useQueryClient();
  const pref = useQuery({ queryKey: ['notifications', 'email'], queryFn: ({ signal }) => apiFetch('/v1/notifications/email', { schema: EmailPref, signal }) });
  const save = useMutation({ mutationFn: (reports: boolean) => apiFetch('/v1/notifications/email', { schema: EmailPref, method: 'PUT', body: EmailPrefSchema.parse({ reports }) }),
    onSettled: () => client.invalidateQueries({ queryKey: ['notifications', 'email'] }) });
  if (!pref.data) return null;
  const { reports, address, available } = pref.data;
  return <div className="border-t px-3 py-2">
    <label className="flex items-center gap-2"><input type="checkbox" checked={reports} disabled={save.isPending || (!available && !reports)} onChange={e => { save.mutate(e.target.checked); }} />Email me watch reports</label>
    <p className="mt-1 text-[11px] text-muted-foreground">{address ? `Sent to ${address}, at most one every 10 minutes.` : 'Needs an email address as your login name.'}{address && !available ? ' Mail is not set up on this server.' : ''}{save.isError ? ' Could not save; try again.' : ''}</p>
  </div>;
}

/** In-app notifications: fills (stops, targets, square-offs) and background task runs. One request every 30 seconds. */
export function NotificationBell({ onOpenSymbol }: { onOpenSymbol: (symbol: string) => void }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const feed = useQuery({ queryKey: key, refetchInterval: 30_000, queryFn: ({ signal }) => apiFetch('/v1/notifications', { schema: NotificationsResponseSchema, signal }) });
  const read = useMutation({ mutationFn: () => apiFetch('/v1/notifications/read', { schema: z.unknown(), method: 'POST', body: {} }),
    onSettled: () => client.invalidateQueries({ queryKey: key }) });
  const unread = feed.data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => { document.removeEventListener('mousedown', close); };
  }, [open]);

  return <div ref={box} className="relative">
    <button type="button" aria-label={unread ? `Notifications, ${String(unread)} unread` : 'Notifications'} aria-expanded={open}
      className="relative grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => { setOpen(o => !o); if (!open && unread > 0) read.mutate(); }}>
      <Bell className="size-4" />
      {unread > 0 && <span className="num absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-[10px] leading-4 text-accent-foreground">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div role="dialog" aria-label="Notifications" className="absolute right-0 top-8 z-50 max-h-[70vh] w-80 overflow-auto border bg-popover text-[12px] shadow-lg">
      <div className="sticky top-0 border-b bg-popover px-3 py-2 font-semibold">Notifications</div>
      {feed.isError && <p role="alert" className="p-3 text-down">Notifications are unavailable right now.</p>}
      {feed.data?.items.length === 0 && <p className="p-3 text-muted-foreground">Nothing yet. Fills, stops, targets and background task runs show up here.</p>}
      <ul>{feed.data?.items.map(n => <li key={n.id} className={`border-b px-3 py-2 ${n.read ? '' : 'bg-muted/40'}`}>
        <button type="button" className="w-full text-left" disabled={!n.link?.symbol}
          onClick={() => { if (n.link?.symbol) { onOpenSymbol(n.link.symbol); setOpen(false); } }}>
          <div className="font-semibold">{n.title}</div>
          {n.body && <div className="whitespace-pre-wrap text-muted-foreground">{n.body}</div>}
          <time className="text-[11px] text-muted-foreground" dateTime={n.createdAt}>{time.format(Date.parse(n.createdAt))}</time>
        </button>
      </li>)}</ul>
      <EmailToggle />
    </div>}
  </div>;
}
