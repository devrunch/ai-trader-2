import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../state';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export function ThemeToggle() {
  const { mode, setMode } = useThemeStore();
  const Icon = mode === 'system' ? Monitor : mode === 'light' ? Sun : Moon;
  return <Tooltip><TooltipTrigger asChild>
    <Button variant="ghost" size="icon-sm" aria-label={'Theme: ' + mode} onClick={() => { setMode(mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'); }}><Icon /></Button>
  </TooltipTrigger><TooltipContent>Theme: {mode}</TooltipContent></Tooltip>;
}
