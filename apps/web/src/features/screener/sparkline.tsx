const W = 80;
const H = 20;

export function Sparkline({ symbol, points }: { symbol: string; points: number[] }) {
  if (points.length < 2) return <span className="text-muted-foreground">-</span>;
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  const path = points.map((p, i) => `${((i / (points.length - 1)) * W).toFixed(1)},${(H - 1 - ((p - min) / span) * (H - 2)).toFixed(1)}`).join(' ');
  const up = (points[points.length - 1] ?? 0) >= (points[0] ?? 0);
  return <svg data-testid={`spark-${symbol}`} role="img" aria-label={`${symbol} recent closes`} width={W} height={H} viewBox={`0 0 ${String(W)} ${String(H)}`}>
    <polyline points={path} fill="none" strokeWidth="1.5" style={{ stroke: up ? 'var(--up)' : 'var(--down)' }} /></svg>;
}
