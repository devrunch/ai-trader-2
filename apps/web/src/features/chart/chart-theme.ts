import type { ChartColors } from './chart-adapter';

/** Chart colours always come from the theme tokens (no hard-coded colours). */
export function readChartColors(root: HTMLElement = document.documentElement): ChartColors {
  const style = getComputedStyle(root);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    up: token('--up', '#08785c'), down: token('--down', '#bd263b'), text: token('--muted-foreground', '#6b7280'),
    grid: token('--border', '#e5e7eb'), background: token('--background', '#ffffff'),
  };
}

/** An indicator colour token (contracts' INDICATOR_COLORS) as the theme's CSS value. */
export function readIndicatorColor(token: string, root: HTMLElement = document.documentElement): string {
  return getComputedStyle(root).getPropertyValue(`--ind-${token}`).trim() || getComputedStyle(root).getPropertyValue('--foreground').trim() || 'currentColor';
}

const ZONES: Record<string, string> = { NSE: 'Asia/Kolkata', BSE: 'Asia/Kolkata', MCX: 'Asia/Kolkata', NYSE: 'America/New_York', NASDAQ: 'America/New_York' };

/** Axis times are shown in the exchange's zone, as on TradingView. */
export function exchangeTimeZone(symbol: string): string { return ZONES[symbol.split(':')[0] ?? ''] ?? 'UTC'; }
