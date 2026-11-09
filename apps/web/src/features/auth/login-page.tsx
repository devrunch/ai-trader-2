import { useState, type SyntheticEvent } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../shared/api/http';
const responseSchema = z.object({ user: z.object({ id: z.uuid(), username: z.string(), role: z.enum(['admin', 'user']) }) });
export function LoginPage() {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const navigate = useNavigate(); const search = useSearch({ strict: false }); const query = useQueryClient();
  async function submit(event: SyntheticEvent<HTMLFormElement>) { event.preventDefault(); setError(''); setBusy(true); try { await apiFetch('/v1/auth/login', { schema: responseSchema, method: 'POST', body: { username, password } }); await query.invalidateQueries({ queryKey: ['auth', 'session'] }); await navigate({ to: typeof search.redirect === 'string' && search.redirect.startsWith('/') ? search.redirect : '/' }); } catch { setError('Invalid username or password. Please try again.'); } finally { setBusy(false); } }
  return <main className="m-auto w-full max-w-sm space-y-5 p-6"><h1 className="text-2xl font-semibold">Sign in</h1><form className="space-y-4" onSubmit={event => { void submit(event); }}><label className="block space-y-1">Username<input autoComplete="username" required minLength={3} maxLength={32} value={username} onChange={event => { setUsername(event.target.value); }} className="w-full rounded border bg-panel p-2" /></label><label className="block space-y-1">Password<input type="password" autoComplete="current-password" required value={password} onChange={event => { setPassword(event.target.value); }} className="w-full rounded border bg-panel p-2" /></label>{error && <p role="alert">{error}</p>}<button className="w-full rounded bg-accent p-2 text-primary-foreground disabled:opacity-50" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></main>;
}
