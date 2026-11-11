import { useEffect, useMemo, useRef, useState } from 'react';
import { BarsResponseSchema, type Bar, type DataStatus, type Interval } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { liveClient } from '../../shared/live/live-connection';
import { statusText } from '../../shared/live/status-text';
import { useThemeStore } from '../../shared/state';
import { Skeleton } from '../../shared/ui/skeleton';
import { ChartAdapter } from './chart-adapter';
import { exchangeTimeZone, readChartColors, readIndicatorColor } from './chart-theme';
import { DrawingLayer } from './drawing-layer';
import { useDrawingStore } from './drawing-store';
import { IndicatorLayer } from './indicator-layer';
import { OhlcLegend } from './ohlc-legend';
import { IndicatorLegend, indicatorLabel, indicatorQueryKey, useChartIndicators, useIndicatorStore } from '../indicators';
import { useQueryClient } from '@tanstack/react-query';
import { createLwcChart } from './lwc-chart';

const PAGE = 500;

/** A live candlestick chart: snapshot plus sequenced updates from LiveClient, older pages on scroll (FR-CH-1, FR-CH-5). */
const INTERVAL_LABEL: Record<string, string> = { '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m', '60': '1h', '240': '4h', '1D': '1D', '1W': '1W', '1M': '1M' };

export function LiveChart({ symbol, interval }: { symbol: string; interval: Interval }) {
  const container = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<ChartAdapter | null>(null);
  const layerRef = useRef<IndicatorLayer | null>(null);
  const drawingRef = useRef<DrawingLayer | null>(null);
  const allDrawings = useDrawingStore(s => s.items);
  const clearDrawings = useDrawingStore(s => s.clear);
  const drawings = useMemo(() => allDrawings.filter(d => d.drawing.symbol === symbol && d.drawing.interval === interval).map(d => d.drawing), [allDrawings, symbol, interval]);
  // Changes once per new bar (never per tick), so indicators refresh on bar close.
  const indicators = useChartIndicators(symbol, interval);
  const indicatorItems = useIndicatorStore(s => s.items);
  // Labels are only for the server's messages, so a catalog that arrives later must not resubscribe.
  const catalogRef = useRef(indicators.catalog.data);
  useEffect(() => { catalogRef.current = indicators.catalog.data; }, [indicators.catalog.data]);
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState<{ bar: Bar; prevClose: number | undefined } | null>(null);
  const [newest, setNewest] = useState<{ bar: Bar | undefined; prevClose: number | undefined }>({ bar: undefined, prevClose: undefined });
  const [empty, setEmpty] = useState(false);
  const [status, setStatus] = useState<DataStatus | undefined>(undefined);
  const mode = useThemeStore(s => s.mode);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const chart = createLwcChart(el, exchangeTimeZone(symbol));
    const adapter = new ChartAdapter(chart, readChartColors());
    adapterRef.current = adapter;
    layerRef.current = new IndicatorLayer(chart, token => readIndicatorColor(token));
    drawingRef.current = new DrawingLayer(chart, token => readIndicatorColor(token));
    const client = liveClient();
    const controller = new AbortController(); // E15: a late page for the previous symbol is never painted
    setLoaded(false); setEmpty(false); setStatus(undefined);
    const offLegend = adapter.onLegend(setHovered);
    // The newest bar and its predecessor's close drive the legend; updated at most once per animation frame.
    let frame = 0;
    const showNewest = (bars: readonly Bar[]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { setNewest({ bar: bars.at(-1), prevClose: bars.at(-2)?.close }); });
    };
    let recent: Bar[] = [];
    const off = client.subscribe(symbol, interval, {
      onReset: bars => { adapter.reset(bars); recent = bars.slice(-2); showNewest(recent); setLoaded(true); setEmpty(bars.length === 0); },
      onUpdate: bar => {
        adapter.update(bar);
        recent = recent.at(-1)?.time === bar.time ? [...recent.slice(0, -1), bar] : [...recent, bar].slice(-2);
        showNewest(recent);
      },
      onStatus: setStatus,
    });
    const loadPage = (before?: number) => {
      const query = new URLSearchParams({ symbol, interval, limit: String(PAGE), ...(before === undefined ? {} : { before: String(before) }) });
      return apiFetch(`/v1/bars?${query.toString()}`, { schema: BarsResponseSchema, signal: controller.signal });
    };
    // The latest page comes over HTTP too: first paint never waits on the socket, and a dead socket still shows history.
    loadPage().then(page => {
      if (controller.signal.aborted) return;
      client.mergeHistory(symbol, interval, page.bars);
      setStatus(current => current ?? page.status);
      if (page.bars.length === 0) { setLoaded(true); setEmpty(true); }
    }).catch(() => undefined);
    adapter.onNeedOlder(before => {
      loadPage(before)
        .then(page => { if (!controller.signal.aborted) client.mergeHistory(symbol, interval, page.bars); })
        .catch(() => undefined); // scrolling left again retries; a failed page never blanks the chart
    });
    return () => { cancelAnimationFrame(frame); offLegend(); controller.abort(); off(); layerRef.current?.destroy(); layerRef.current = null; drawingRef.current?.destroy(); drawingRef.current = null; adapter.destroy(); adapterRef.current = null; };
  }, [symbol, interval]);

  useEffect(() => { adapterRef.current?.applyColors(readChartColors()); layerRef.current?.recolor(); }, [mode]);
  useEffect(() => { layerRef.current?.set(indicators.series); }, [indicators.series]);
  // Per-tick indicator values over the socket (FR-IN-5); a resubscribe brings the full series back through the query cache.
  useEffect(() => {
    const client = liveClient();
    const stops = indicatorItems.map(item => client.watchIndicator(symbol, interval, item.key, { kind: 'builtin', id: item.id, inputs: item.inputs }, {
      onUpdate: point => { layerRef.current?.update(item.key, point); },
      onReset: result => { queryClient.setQueryData(indicatorQueryKey(symbol, interval, item, indicatorItems), result); },
      onError: () => undefined, // the HTTP series and its error stay on screen; the legend shows that error
    }, indicatorLabel(catalogRef.current?.find(d => d.id === item.id), item)));
    return () => { for (const stop of stops) stop(); };
  }, [symbol, interval, indicatorItems, queryClient]);
  useEffect(() => { drawingRef.current?.set(drawings); }, [drawings, loaded]);

  const stale = status?.state === 'stale' ? statusText(status) : undefined;
  return <div className="relative h-full min-h-80 w-full">
    <div ref={container} className="absolute inset-0" data-testid="chart-canvas" />
    {loaded && <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1.5">
      <OhlcLegend symbol={symbol} interval={INTERVAL_LABEL[interval] ?? interval} bar={hovered?.bar ?? newest.bar}
        previousClose={hovered ? hovered.prevClose : newest.prevClose} />
      <IndicatorLegend rows={indicators.rows} />
    </div>}
    {loaded && drawings.length > 0 && <button type="button" className="absolute right-16 top-3 z-10 rounded border bg-panel px-2 py-1 text-xs"
      onClick={() => { clearDrawings(symbol, interval); }}>Clear drawings ({drawings.reduce((n, d) => n + d.segments.length, 0)})</button>}
    {!loaded && <div role="status" aria-label="Loading chart" className="absolute inset-0 space-y-3 bg-background p-4"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-[70%] w-full" /></div>}
    {loaded && stale && <div role="status" className={`absolute left-3 top-3 rounded border bg-panel px-2 py-1 text-xs ${empty ? '' : 'opacity-90'}`}>{stale}{status?.state === 'stale' && status.detail ? ` · ${status.detail}` : ''}</div>}
    {loaded && empty && !stale && <div role="status" className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">No bars yet for {symbol}.</div>}
  </div>;
}
