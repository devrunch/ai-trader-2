import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { House, Shield } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../shared/ui/tooltip';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

function MainNav() {
  const link = 'inline-flex min-h-10 items-center rounded px-3 text-muted-foreground md:min-h-8 md:px-2 hover:bg-muted hover:text-foreground';
  return <nav aria-label="Main navigation" className="flex items-center gap-1 text-[13px] md:text-[12px]">
    <Link to="/" className={link} activeProps={{ className: 'text-foreground' }} activeOptions={{ exact: true }}>Home</Link>
    <Link to="/terminal" search={{ symbol: 'NSE:NIFTY', interval: '5' }} className={link} activeProps={{ className: 'text-foreground' }}>Terminal</Link>
    <Link to="/strategies" className={link} activeProps={{ className: 'text-foreground' }}>Strategies</Link>
    <Link to="/desk" search={{ symbol: 'NSE:NIFTY' }} className={link} activeProps={{ className: 'text-foreground' }}>Desk</Link>
    <Link to="/admin" search={{ tab: undefined, notice: undefined }} className={link} activeProps={{ className: 'text-foreground' }}>Admin</Link>
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

export function Brand() {
  return <span data-testid="app-root" className="px-1 text-[13px] font-semibold">AI Trader</span>;
}

/** The terminal draws its own toolbar; every other page gets this slim header. */
export function AppShell() {
  const terminal = useRouterState({ select: state => state.location.pathname.startsWith('/terminal') });
  return <div className="flex h-dvh flex-col">
    {!terminal && <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-panel px-2 md:h-10 md:gap-3">
      <Brand /><MainNav /><span className="ml-auto"><ThemeToggle /></span>
    </header>}
    <main className="flex min-h-0 flex-1 flex-col"><Outlet /></main>
  </div>;
}
