import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { RequireRole } from '../auth/index';
import { useConnectZerodha } from './use-admin';
import { connectFailureReason } from './zerodha-messages';

// A request_token is single-use; survive React's double effect run and re-renders.
const consumed = new Set<string>();

/**
 * Kite redirects here after login. The session cookie is SameSite=Strict, so it is not sent on that
 * cross-site redirect; this page posts the token as a same-site request instead (P2-10c).
 */
export function ZerodhaCallbackPage() {
  return <RequireRole role="admin"><ExchangeToken /></RequireRole>;
}

function ExchangeToken() {
  const search: { request_token?: unknown; status?: unknown } = useSearch({ strict: false });
  const navigate = useNavigate();
  const connect = useConnectZerodha();
  // Read once: stripping the token from the URL re-renders this page without it.
  const [{ token, ok }] = useState(() => ({
    token: typeof search.request_token === 'string' ? search.request_token : undefined,
    ok: search.status === 'success',
  }));

  useEffect(() => {
    if (token !== undefined && consumed.has(token)) return;
    const finish = (notice: string) => { void navigate({ to: '/admin', search: { tab: 'zerodha', notice }, replace: true }); };
    // Drop the token from the address bar and history before anything else.
    void navigate({ to: '/admin/zerodha/callback', search: {}, replace: true });
    if (!token || !ok) { finish('CALLBACK_FAILED'); return; }
    consumed.add(token);
    connect.mutate(token, { onSuccess: () => { finish('connected'); }, onError: error => { finish(connectFailureReason(error)); } });
  }, [token, ok, navigate, connect]);

  return <main className="m-auto p-6 text-sm" role="status">Connecting Zerodha…</main>;
}
