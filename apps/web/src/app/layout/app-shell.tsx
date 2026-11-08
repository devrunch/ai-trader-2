import { Link, Outlet } from '@tanstack/react-router';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../../shared/state';
import { Button } from '../../shared/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../shared/ui/tooltip';
export function AppShell() {
  const { mode, setMode } = useThemeStore();
  const Icon = mode === 'system' ? Monitor : mode === 'light' ? Sun : Moon;
  return <div className="flex h-dvh flex-col">
    <header className="flex flex-wrap items-center gap-6 border-b bg-panel px-4 py-3">
      <span data-testid="app-root" className="font-semibold tracking-tight">AI Trader</span>
      <nav aria-label="Main navigation" className="flex gap-4 text-sm">
        <Link to="/" activeProps={{ className: 'text-accent' }} activeOptions={{ exact: true }}>Home</Link>
        <Link to="/terminal" search={{ symbol: 'NSE:NIFTY', interval: '5' }} activeProps={{ className: 'text-accent' }}>Terminal</Link>
      </nav>
      <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="ml-auto" aria-label={'Theme: ' + mode} onClick={() => { setMode(mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'); }}><Icon /></Button></TooltipTrigger><TooltipContent>Theme: {mode}</TooltipContent></Tooltip>
    </header>
    <main className="flex min-h-0 flex-1 flex-col"><Outlet /></main>
  </div>;
}
