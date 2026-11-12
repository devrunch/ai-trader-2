import { useState, type SyntheticEvent } from 'react';
import type { ZerodhaStatus } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { Badge, PanelState, formatIst } from './panel-states';
import { useAutoLogin, useConnectZerodha, useDisconnectZerodha, useZerodhaStatus } from './use-admin';
import { connectFailureMessage } from './zerodha-messages';

const blockReasons: Record<string, string> = { CAPTCHA_REQUIRED: 'Zerodha asked for a CAPTCHA' };

export function ZerodhaCard() {
  const status = useZerodhaStatus();
  return <section aria-labelledby="zerodha-title" className="space-y-4">
    <h2 id="zerodha-title" className="text-base font-semibold">Zerodha</h2>
    <PanelState query={status}>{data => <ZerodhaDetails status={data} />}</PanelState>
  </section>;
}

function ZerodhaDetails({ status }: { status: ZerodhaStatus }) {
  const [dialog, setDialog] = useState<'paste' | 'disconnect' | null>(null);
  const autoLogin = useAutoLogin();
  const disconnect = useDisconnectZerodha();
  const { enabled, attemptsToday, cap, blockedUntil, reason, lastFailure } = status.autoLogin;
  const blockedText = blockedUntil ? `Blocked until ${formatIst(blockedUntil)} — ${reason ? (blockReasons[reason] ?? reason) : 'blocked'}` : undefined;
  const autoDisabledWhy = !enabled ? 'Auto-login is disabled (KITE_AUTO_LOGIN=false).' : blockedText;

  return <div className="space-y-3 text-sm">
    <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
      <dt className="text-muted-foreground">Session</dt>
      <dd>{status.connected && status.expiresAt
        ? <Badge tone="up">Connected until {formatIst(status.expiresAt)}</Badge>
        : <Badge tone="down">Not connected</Badge>}</dd>
      <dt className="text-muted-foreground">Auto-login</dt>
      <dd className="space-x-2">
        <Badge tone={enabled ? 'muted' : 'warning'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
        <span>{`${String(attemptsToday)} / ${String(cap)} today`}</span>
        {blockedText && <p className="mt-1 text-down">{blockedText}</p>}
        {lastFailure && <p className="mt-1 text-down">{`Last auto-login failed at ${lastFailure.stage} · ${formatIst(lastFailure.at)}: ${lastFailure.message}`}</p>}
      </dd>
    </dl>
    {status.redirectUrl === null && <p className="text-muted-foreground">Set your Kite app redirect URL to <code>http://localhost:5173/admin/zerodha/callback</code>, or paste the request_token instead.</p>}
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm"><a href={status.loginUrl}>Connect Zerodha</a></Button>
      <Button size="sm" variant="outline" onClick={() => { setDialog('paste'); }}>Paste request token</Button>
      <Button size="sm" variant="outline" disabled={autoDisabledWhy !== undefined || autoLogin.isPending} title={autoDisabledWhy}
        onClick={() => { autoLogin.mutate(); }}>{autoLogin.isPending ? 'Logging in…' : 'Try auto-login'}</Button>
      {status.connected && <Button size="sm" variant="ghost" onClick={() => { setDialog('disconnect'); }}>Disconnect</Button>}
    </div>
    {autoLogin.isError && <p role="alert" className="text-down">{connectFailureMessage(autoLogin.error)}</p>}
    {dialog === 'paste' && <PasteTokenDialog onClose={() => { setDialog(null); }} />}
    {dialog === 'disconnect' && <Dialog title="Disconnect Zerodha" description="Removes the stored Kite session." onClose={() => { setDialog(null); }}>
      <p className="mb-4 text-sm">Live Indian data stops until you connect again.</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => { setDialog(null); }}>Cancel</Button>
        <Button size="sm" variant="destructive" disabled={disconnect.isPending}
          onClick={() => { disconnect.mutate(undefined, { onSettled: () => { setDialog(null); } }); }}>Disconnect</Button>
      </div>
    </Dialog>}
  </div>;
}

function PasteTokenDialog({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState('');
  const connect = useConnectZerodha();
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    connect.mutate(token.trim(), { onSuccess: onClose });
  }
  return <Dialog title="Paste request token" description="Paste the request_token from the Kite redirect URL." onClose={onClose}>
    <form className="space-y-3 text-sm" onSubmit={submit}>
      <label className="block space-y-1">Request token
        <input autoFocus required autoComplete="off" spellCheck={false} pattern="[A-Za-z0-9]{8,64}" value={token}
          onChange={event => { setToken(event.target.value); }} className="w-full rounded border bg-panel p-2 font-mono" />
      </label>
      {connect.isError && <p role="alert" className="text-down">{connectFailureMessage(connect.error)}</p>}
      <div className="flex justify-end"><Button size="sm" type="submit" disabled={connect.isPending}>{connect.isPending ? 'Connecting…' : 'Submit'}</Button></div>
    </form>
  </Dialog>;
}
