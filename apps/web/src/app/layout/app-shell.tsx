import { useEffect } from 'react';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { SESSION_EXPIRED } from '../../shared/api/http';
import { House, Shield } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../shared/ui/tooltip';
import { ThemeToggle } from '../../shared/ui/theme-toggle';
import { AiButton } from '../../shared/ui/ai-button';
import { Wordmark } from '../../shared/ui/brand-mark';
import { useSession } from '../../features/auth';
import { DeskRunningPill } from '../../features/desk';

function MainNav() {
  const link = 'relative inline-flex min-h-10 items-center px-3 text-muted-foreground transition-colors md:min-h-12 md:px-2.5 hover:text-foreground';
  const active = { className: 'text-foreground after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:bg-link' };
  return <nav aria-label="Main navigation" className="flex items-center gap-0.5 overflow-x-auto text-[13px] [scrollbar-width:none]">
    <Link to="/" className={link} activeProps={active} activeOptions={{ exact: true }}>Home</Link>
    <Link to="/terminal" search={{ symbol: 'NSE:NIFTY', interval: '5' }} className={link} activeProps={active}>Terminal</Link>
    <Link to="/strategies" className={link} activeProps={active}>Strategies</Link>
    <Link to="/screener" className={link} activeProps={active}>Screener</Link>
    <Link to="/desk" search={{ symbol: 'NSE:NIFTY' }} className={link} activeProps={active}>AI Desk</Link>
    <Link to="/admin" search={{ tab: undefined, notice: undefined }} className={link} activeProps={active}>Admin</Link>
  </nav>;
}

/** Icon-only navigation for the terminal toolbar, where width belongs to the chart controls. */
export function CompactNav() {
  const item = 'grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground';
  return <nav aria-label="Main navigation" className="flex items-center">
    <Tooltip><TooltipTrigger asChild><Link to="/" aria-label="Home" className={item}><House className="size-4" /></Link></TooltipTrigger><TooltipContent>Home</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Link to="/admin" search={{ tab: undefined, notice: undefined }} aria-label="Admin" className={item}><Shield className="size-4" /></Link></TooltipTrigger><TooltipContent>Admin</TooltipContent></Tooltip>
  </nav>;
}

function Brand() {
  return <span data-testid="app-root"><Wordmark className="px-1" /></span>;
}

/** Pages that draw their own chrome: the terminal (toolbar), sign-in, and the public page for visitors. */
function useOwnChrome(): boolean {
  const path = useRouterState({ select: state => state.location.pathname });
  const session = useSession();
  if (path.startsWith('/terminal') || path.startsWith('/login')) return true;
  return path === '/' && session.isError;
}

export function AppShell() {
  const ownChrome = useOwnChrome();
  const signedIn = useSession().isSuccess;
  const navigate = useNavigate();
  const client = useQueryClient();
  const path = useRouterState({ select: state => state.location.pathname });
  // An expired session on a page that needs one goes to sign-in and comes back here afterwards, instead of failing quietly.
  useEffect(() => {
    const expired = () => {
      void client.invalidateQueries({ queryKey: ['auth', 'session'] });
      if (path !== '/' && !path.startsWith('/login')) void navigate({ to: '/login', search: { redirect: window.location.pathname + window.location.search } });
    };
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => { window.removeEventListener(SESSION_EXPIRED, expired); };
  }, [client, navigate, path]);
  return <div className="flex h-dvh flex-col">
    {!ownChrome && <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-panel px-3 md:gap-4">
      <Link to="/" aria-label="AI Trader home" className="shrink-0"><Brand /></Link>
      <MainNav />
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <DeskRunningPill enabled={signedIn} />
        <AiButton size="sm" onClick={() => { void navigate({ to: '/terminal', search: { symbol: 'NSE:NIFTY', interval: '5', panel: 'assistant' } }); }}>Ask AI</AiButton>
        <ThemeToggle />
      </span>
    </header>}
    <main className="flex min-h-0 flex-1 flex-col"><Outlet /></main>
  </div>;
}
