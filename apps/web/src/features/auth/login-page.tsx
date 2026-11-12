import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../shared/api/http';
import { Button } from '../../shared/ui/button';
import { Wordmark } from '../../shared/ui/brand-mark';

const responseSchema = z.object({ user: z.object({ id: z.uuid(), username: z.string(), role: z.enum(['admin', 'user']) }) });
const LINE = 'M0,230 L60,210 L110,222 L170,170 L220,184 L280,128 L330,146 L390,96 L450,118 L510,70 L570,92 L640,40 L700,58 L760,22';
const BARS = [30, 44, 26, 52, 38, 60, 34, 70, 48, 62, 40, 76, 54, 82];
const field = 'h-11 w-full border bg-background px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40';

/** Faint, live-looking market backdrop: grid, price line and volume bars, all SVG. */
function Backdrop() {
  return <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 size-full text-link opacity-[0.16] [mask-image:radial-gradient(ellipse_45%_55%_at_50%_45%,transparent_35%,black_100%)]" viewBox="0 0 760 300" preserveAspectRatio="xMidYMax slice">
    <defs>
      <pattern id="login-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.5" /></pattern>
      <linearGradient id="login-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.35" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient>
    </defs>
    <rect width="760" height="300" fill="url(#login-grid)" />
    {BARS.map((h, i) => <rect key={i} x={i * 54 + 8} y={300 - h} width="22" height={h} fill="currentColor" opacity="0.35" />)}
    <path d={`${LINE} L760,300 L0,300 Z`} fill="url(#login-fade)" />
    <path d={LINE} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" className="login-line" />
  </svg>;
}

export function LoginPage() {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const navigate = useNavigate(); const search = useSearch({ strict: false }); const query = useQueryClient();
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await apiFetch('/v1/auth/login', { schema: responseSchema, method: 'POST', body: { username, password } });
      await query.invalidateQueries({ queryKey: ['auth', 'session'] });
      await navigate({ to: typeof search.redirect === 'string' && search.redirect.startsWith('/') ? search.redirect : '/' });
    } catch { setError('Invalid username or password. Please try again.'); } finally { setBusy(false); }
  }
  return <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto overflow-x-hidden px-4 py-8">
    <style>{'@keyframes login-draw{from{stroke-dashoffset:1200}to{stroke-dashoffset:0}}.login-line{stroke-dasharray:1200;animation:login-draw 2.4s ease-out both}@media (prefers-reduced-motion:reduce){.login-line{animation:none}}'}</style>
    <Backdrop />
    <div className="relative w-full max-w-sm">
      <div className="mb-6">
        <Link to="/" aria-label="AI Trader home"><Wordmark /></Link>
        <h1 className="font-display mt-6 text-[2.25rem] font-semibold leading-tight tracking-tight">Sign in</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">Live charts, paper trading and an assistant that reads the market with you.</p>
      </div>
      <form className="space-y-4 border bg-panel p-5 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.5)]" onSubmit={event => { void submit(event); }}>
        <label className="block space-y-1.5 text-[13px] font-medium">Username
          <input autoComplete="username" required minLength={3} maxLength={32} value={username} onChange={event => { setUsername(event.target.value); }} className={field} />
        </label>
        <label className="block space-y-1.5 text-[13px] font-medium">Password
          <input type="password" autoComplete="current-password" required value={password} onChange={event => { setPassword(event.target.value); }} className={field} />
        </label>
        {error && <p role="alert" className="rounded border border-down/40 bg-down/10 px-3 py-2 text-[13px] text-down">{error}</p>}
        <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  </div>;
}
