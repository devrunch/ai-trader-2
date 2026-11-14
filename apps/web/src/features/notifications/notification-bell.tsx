import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { EmailPrefSchema, NotificationsResponseSchema } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';

const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const key = ['notifications'] as const;
const EmailPref = z.object({ reports: z.boolean(), address: z.string().nullable(), available: z.boolean() });

/** Opt in to getting the assistant's reports by email, at an address the user types once. */
function EmailToggle() {
  const [draft, setDraft] = useState('');
  const client = useQueryClient();
  const pref = useQuery({ queryKey: ['notifications', 'email'], queryFn: ({ signal }) => apiFetch('/v1/notifications/email', { schema: EmailPref, signal }) });
  const save = useMutation({ mutationFn: (body: { reports: boolean; address?: string }) => apiFetch('/v1/notifications/email', { schema: EmailPref, method: 'PUT', body: EmailPrefSchema.parse(body) }),
    onSettled: () => client.invalidateQueries({ queryKey: ['notifications', 'email'] }) });
  if (!pref.data) return null;
  const { reports, address, available } = pref.data;
  const valid = EmailPrefSchema.safeParse({ reports: true, address: draft.trim() }).success;
  return <div className="space-y-1.5 border-t px-3 py-2">
    {address
      ? <label className="flex items-center gap-2"><input type="checkbox" checked={reports} disabled={save.isPending} onChange={e => { save.mutate({ reports: e.target.checked }); }} />Email me the assistant's reports</label>
      : <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); if (valid) save.mutate({ reports: true, address: draft.trim() }); }}>
        <input type="email" aria-label="Email for reports" placeholder="Email me reports at…" value={draft} onChange={e => { setDraft(e.target.value); }} className="h-7 min-w-0 flex-1 border bg-background px-2 text-sm" />
        <button type="submit" disabled={!valid || save.isPending} className="border px-2 text-sm disabled:opacity-50">Turn on</button></form>}
    <p className="text-xs text-muted-foreground">{address ? `Sent to ${address}, at most one every 10 minutes.` : 'Only reports the assistant decides are worth your attention.'}{address && !available ? ' Mail is not set up on this server yet.' : ''}{save.isError ? ' Could not save; check the address and try again.' : ''}</p>
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
      {unread > 0 && <span className="num absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-[11px] leading-4 text-accent-foreground">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div role="dialog" aria-label="Notifications" className="absolute right-0 top-8 z-50 max-h-[70vh] w-80 overflow-auto border bg-popover text-sm shadow-lg">
      <div className="sticky top-0 border-b bg-popover px-3 py-2 font-semibold">Notifications</div>
      {feed.isError && <p role="alert" className="p-3 text-down">Notifications are unavailable right now.</p>}
      {feed.data?.items.length === 0 && <p className="p-3 text-muted-foreground">Nothing yet. Fills, stops, targets and background task runs show up here.</p>}
      <ul>{feed.data?.items.map(n => <li key={n.id} className={`border-b px-3 py-2 ${n.read ? '' : 'bg-muted/40'}`}>
        <button type="button" className="w-full text-left" disabled={!n.link?.symbol}
          onClick={() => { if (n.link?.symbol) { onOpenSymbol(n.link.symbol); setOpen(false); } }}>
          <div className="font-semibold">{n.title}</div>
          {n.body && <div className="whitespace-pre-wrap text-muted-foreground">{n.body}</div>}
          <time className="text-xs text-muted-foreground" dateTime={n.createdAt}>{time.format(Date.parse(n.createdAt))}</time>
        </button>
      </li>)}</ul>
      <EmailToggle />
    </div>}
  </div>;
}
