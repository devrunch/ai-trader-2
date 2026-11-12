import { ColorType, LineSeries, createChart, type UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { readChartColors } from '../chart';

/** Small equity line; the only place this feature touches the canvas. */
export function EquityChart({ points }: { points: Array<{ time: number; equity: number }> }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const colors = readChartColors();
    const chart = createChart(element, { autoSize: true, timeScale: { timeVisible: true },
      layout: { background: { type: ColorType.Solid, color: colors.background }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } } });
    const series = chart.addSeries(LineSeries, { color: colors.up, lineWidth: 2, priceLineVisible: false });
    series.setData(points.map(p => ({ time: Math.floor(p.time / 1000) as UTCTimestamp, value: p.equity })));
    chart.timeScale().fitContent();
    return () => { chart.remove(); };
  }, [points]);
  return <div ref={host} role="img" aria-label="Equity curve" className="h-40 w-full" />;
}
