import { afterEach, describe, expect, it } from 'vitest';
import { defaultPresentation } from '../style';
import { useIndicatorStore } from './indicator-store';

const definition = { ref: 'builtin:sma@1', id: 'sma', version: 1, name: 'SMA', shortName: 'SMA', overlay: true, inputs: [], levels: [],
  plots: [{ id: 'ma', title: 'MA', kind: 'line' as const, color: 'blue' as const, lineWidth: 1 }] };
afterEach(() => { useIndicatorStore.setState({ items: [], presentation: {} }); });

describe('indicator store presentation', () => {
  it('round-trips a style and leaves the items array untouched', () => {
    const { add, setPresentation } = useIndicatorStore.getState();
    add('sma');
    const before = useIndicatorStore.getState().items;
    const key = before[0]?.key ?? '';
    const presentation = defaultPresentation(definition);
    presentation.style.precision = 3;
    setPresentation(key, presentation);
    expect(useIndicatorStore.getState().presentation[key]?.style.precision).toBe(3);
    expect(useIndicatorStore.getState().items).toBe(before);
  });

  it('drops the presentation on undefined and when the indicator is removed', () => {
    const { add, setPresentation, remove } = useIndicatorStore.getState();
    add('sma');
    const key = useIndicatorStore.getState().items[0]?.key ?? '';
    setPresentation(key, defaultPresentation(definition));
    setPresentation(key, undefined);
    expect(useIndicatorStore.getState().presentation).toEqual({});
    setPresentation(key, defaultPresentation(definition));
    remove(key);
    expect(useIndicatorStore.getState().presentation).toEqual({});
  });
});
