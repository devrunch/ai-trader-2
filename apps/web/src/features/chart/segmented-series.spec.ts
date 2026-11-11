import { describe, expect, it, vi } from 'vitest';
import type { IndicatorSeriesLike } from './chart-adapter';
import { SegmentedSeries } from './segmented-series';

function factory() {
  const made: { setData: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; priceLine: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }[] = [];
  const create = (): IndicatorSeriesLike => { const s = { setData: vi.fn(), update: vi.fn(), priceLine: vi.fn(), remove: vi.fn() }; made.push(s); return s; };
  return { made, create };
}

// B1: Lightweight Charts joins the points either side of a whitespace point, so each run of values gets its own series.
describe('SegmentedSeries', () => {
  it('paints each run of values on its own series so a null breaks the line', () => {
    const { made, create } = factory();
    const series = new SegmentedSeries(create);
    series.setData([{ time: 1 }, { time: 2, value: 5 }, { time: 3, value: 6 }, { time: 4 }, { time: 5 }, { time: 6, value: 7 }]);
    expect(made).toHaveLength(2);
    expect(made[0]?.setData).toHaveBeenLastCalledWith([{ time: 2, value: 5 }, { time: 3, value: 6 }]);
    expect(made[1]?.setData).toHaveBeenLastCalledWith([{ time: 6, value: 7 }]);
  });

  it('removes surplus run series when the data has fewer runs', () => {
    const { made, create } = factory();
    const series = new SegmentedSeries(create);
    series.setData([{ time: 1, value: 1 }, { time: 2 }, { time: 3, value: 3 }]);
    series.setData([{ time: 1, value: 1 }, { time: 2, value: 2 }]);
    expect(made[1]?.remove).toHaveBeenCalled();
    expect(made[0]?.setData).toHaveBeenLastCalledWith([{ time: 1, value: 1 }, { time: 2, value: 2 }]);
  });

  it('continues the open run on a live value and starts a new series after a null', () => {
    const { made, create } = factory();
    const series = new SegmentedSeries(create);
    series.setData([{ time: 1, value: 1 }]);
    series.update({ time: 2, value: 2 });
    expect(made[0]?.update).toHaveBeenLastCalledWith({ time: 2, value: 2 });
    series.update({ time: 3 });
    series.update({ time: 4, value: 4 });
    expect(made).toHaveLength(2);
    expect(made[1]?.update).toHaveBeenLastCalledWith({ time: 4, value: 4 });
  });

  it('reuses the series of a run that a forming bar emptied', () => {
    const { made, create } = factory();
    const series = new SegmentedSeries(create);
    series.setData([{ time: 1, value: 1 }]);
    series.update({ time: 2, value: 2 });
    series.update({ time: 2 });
    series.update({ time: 2, value: 3 });
    expect(made).toHaveLength(1);
  });

  it('hangs price lines on the first series', () => {
    const { made, create } = factory();
    const series = new SegmentedSeries(create);
    series.priceLine(70, 'L', 'gray');
    expect(made[0]?.priceLine).toHaveBeenCalledWith(70, 'L', 'gray');
  });
});
