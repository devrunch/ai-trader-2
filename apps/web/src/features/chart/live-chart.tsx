import { useEffect, useRef, useState } from 'react';
import { BarsResponseSchema, type DataStatus, type Interval } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { liveClient } from '../../shared/live/live-connection';
import { statusText } from '../../shared/live/status-text';
import { useThemeStore } from '../../shared/state';
import { Skeleton } from '../../shared/ui/skeleton';
import { ChartAdapter } from './chart-adapter';
import { exchangeTimeZone, readChartColors } from './chart-theme';
import { createLwcChart } from './lwc-chart';

const PAGE = 500;

/** A live candlestick chart: snapshot plus sequenced updates from LiveClient, older pages on scroll (FR-CH-1, FR-CH-5). */
export function LiveChart({ symbol, interval }: { symbol: string; interval: Interval }) {
  const container = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<ChartAdapter | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [status, setStatus] = useState<DataStatus | undefined>(undefined);
  const mode = useThemeStore(s => s.mode);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const adapter = new ChartAdapter(createLwcChart(el, exchangeTimeZone(symbol)), readChartColors());
    adapterRef.current = adapter;
    const client = liveClient();
    const controller = new AbortController(); // E15: a late page for the previous symbol is never painted
    setLoaded(false); setEmpty(false); setStatus(undefined);
    const off = client.subscribe(symbol, interval, {
      onReset: bars => { adapter.reset(bars); setLoaded(true); setEmpty(bars.length === 0); },
      onUpdate: bar => { adapter.update(bar); },
      onStatus: setStatus,
    });
    adapter.onNeedOlder(before => {
      const query = new URLSearchParams({ symbol, interval, before: String(before), limit: String(PAGE) });
      apiFetch(`/v1/bars?${query.toString()}`, { schema: BarsResponseSchema, signal: controller.signal })
        .then(page => { if (!controller.signal.aborted) client.mergeHistory(symbol, interval, page.bars); })
        .catch(() => undefined); // scrolling left again retries; a failed page never blanks the chart
    });
    return () => { controller.abort(); off(); adapter.destroy(); adapterRef.current = null; };
  }, [symbol, interval]);

  useEffect(() => { adapterRef.current?.applyColors(readChartColors()); }, [mode]);

  const stale = status?.state === 'stale' ? statusText(status) : undefined;
  return <div className="relative h-full min-h-80 w-full">
    <div ref={container} className="absolute inset-0" data-testid="chart-canvas" />
    {!loaded && <div role="status" aria-label="Loading chart" className="absolute inset-0 space-y-3 bg-background p-4"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-[70%] w-full" /></div>}
    {loaded && stale && <div role="status" className={`absolute left-3 top-3 rounded border bg-panel px-2 py-1 text-xs ${empty ? '' : 'opacity-90'}`}>{stale}{status?.state === 'stale' && status.detail ? ` · ${status.detail}` : ''}</div>}
    {loaded && empty && !stale && <div role="status" className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">No bars yet for {symbol}.</div>}
  </div>;
}
