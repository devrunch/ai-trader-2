import { AreaSeries, CandlestickSeries, ColorType, HistogramSeries, LineSeries, LineStyle, LineType, createChart, type IChartApi, type LineWidth, type Time, type UTCTimestamp } from 'lightweight-charts';
import type { ChartColors, ChartLike, IndicatorSeriesLike, IndicatorSeriesOptions } from './chart-adapter';

const ts = (seconds: number): UTCTimestamp => seconds as UTCTimestamp;
const seconds = (time: Time): number => (typeof time === 'number' ? time : 0);

/** Binds Lightweight Charts 5 to ChartLike. Candles in pane 0, volume in its own pane below. Times shown in the exchange's zone. */
export function createLwcChart(container: HTMLElement, timeZone: string): ChartLike {
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short' });
  const full = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const chart = createChart(container, {
    autoSize: true,
    localization: { timeFormatter: (time: Time) => full.format(seconds(time) * 1000) },
    timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 4,
      tickMarkFormatter: (time: Time, type: number) => (type <= 2 ? day : clock).format(seconds(time) * 1000) },
  });
  const candles = chart.addSeries(CandlestickSeries, { borderVisible: false });
  const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1);
  chart.panes()[1]?.setHeight(90);

  return {
    candles: {
      setData: points => { candles.setData(points.map(p => ({ ...p, time: ts(p.time) }))); },
      update: point => { candles.update({ ...point, time: ts(point.time) }); },
    },
    volume: {
      setData: points => { volume.setData(points.map(p => ({ ...p, time: ts(p.time) }))); },
      update: point => { volume.update({ ...point, time: ts(point.time) }); },
    },
    onVisibleRange: cb => {
      const listener = (range: { from: number } | null) => { cb(range ? range.from : null); };
      chart.timeScale().subscribeVisibleLogicalRangeChange(listener);
      return () => { chart.timeScale().unsubscribeVisibleLogicalRangeChange(listener); };
    },
    onCrosshair: cb => {
      const listener = (param: { time?: Time }) => { cb(param.time === undefined ? null : seconds(param.time)); };
      chart.subscribeCrosshairMove(listener);
      return () => { chart.unsubscribeCrosshairMove(listener); };
    },
    applyColors: (colors: ChartColors) => {
      chart.applyOptions({
        layout: { background: { type: ColorType.Solid, color: colors.background }, textColor: colors.text },
        grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      });
      candles.applyOptions({ upColor: colors.up, downColor: colors.down, wickUpColor: colors.up, wickDownColor: colors.down });
    },
    addIndicatorSeries: options => addIndicatorSeries(chart, options),
    remove: () => { chart.remove(); },
  };
}

const width = (value: number): LineWidth => (value >= 4 ? 4 : value === 3 ? 3 : value === 2 ? 2 : 1);

function addIndicatorSeries(chart: IChartApi, { kind, color, lineWidth, pane, title }: IndicatorSeriesOptions): IndicatorSeriesLike {
  const common = { title, priceLineVisible: false, lastValueVisible: true };
  const series = kind === 'histogram' ? chart.addSeries(HistogramSeries, { ...common, color }, pane)
    : kind === 'area' ? chart.addSeries(AreaSeries, { ...common, lineColor: color, topColor: color, bottomColor: 'transparent', lineWidth: width(lineWidth) }, pane)
    : chart.addSeries(LineSeries, { ...common, color, lineWidth: width(lineWidth), lineType: kind === 'step' ? LineType.WithSteps : LineType.Simple,
      lineVisible: kind !== 'circles', pointMarkersVisible: kind === 'circles' }, pane);
  return {
    setData: points => { series.setData(points.map(p => ({ ...p, time: ts(p.time) }))); },
    update: point => { series.update({ ...point, time: ts(point.time) }); },
    priceLine: (price, label, lineColor) => { series.createPriceLine({ price, title: label, color: lineColor, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false }); },
    remove: () => { chart.removeSeries(series); },
  };
}
