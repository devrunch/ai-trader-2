import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../shared/api/http';
import { Button } from '../../shared/ui/button';
import { Badge, PanelState } from './panel-states';

const statusSchema = z.object({ configured: z.boolean(), recipients: z.array(z.string()) });
const testSchema = z.object({ result: z.enum(['sent', 'disabled', 'failed']) });
const outcome = { sent: 'Test email sent.', disabled: 'Mail is not configured; nothing was sent.', failed: 'The mail server refused the test email; check SMTP_URL.' } as const;

/** Ops alerts are email only: what is configured, who receives them, and a test send. */
export function AlertsPanel() {
  const status = useQuery({ queryKey: ['admin', 'alerts'], queryFn: ({ signal }) => apiFetch('/v1/admin/alerts', { schema: statusSchema, signal }) });
  const test = useMutation({ mutationFn: () => apiFetch('/v1/admin/alerts/test', { schema: testSchema, method: 'POST' }) });
  return <PanelState query={status}>{data => <div className="space-y-4 text-sm">
    <p className="text-muted-foreground">Emails: Zerodha reminder at 08:45 IST on trading days, data report at 15:50 IST, failed jobs and feeds down in market hours (at most hourly each).</p>
    {data.configured
      ? <p className="flex flex-wrap items-center gap-2"><Badge tone="up">Mail configured</Badge>{data.recipients.map(r => <span key={r} className="font-mono">{r}</span>)}</p>
      : <p className="text-warning">Mail is not configured. Add <code>SMTP_URL</code>, <code>ALERT_EMAIL_FROM</code> and <code>ALERT_EMAIL_TO</code> to <code>apps/api/.env</code> and restart the API.</p>}
    <Button size="sm" variant="outline" disabled={!data.configured || test.isPending} onClick={() => { test.mutate(); }}>{test.isPending ? 'Sending…' : 'Send test email'}</Button>
    {test.data && <p role="status" className={test.data.result === 'sent' ? 'text-up' : 'text-down'}>{outcome[test.data.result]}</p>}
    {test.isError && <p role="alert" className="text-down">Could not reach the server.</p>}
  </div>}</PanelState>;
}
