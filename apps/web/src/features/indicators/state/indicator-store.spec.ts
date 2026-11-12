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

describe('indicator store pine items', () => {
  const pine = { ...definition, ref: 'pine:aaaaaaaaaaaa@1', id: 'aaaaaaaaaaaa',
    inputs: [{ id: 'length', title: 'Length', type: 'int' as const, default: 5 }, { id: 'mult', title: 'Mult', type: 'float' as const, default: 2 }] };

  it('adds a Pine item whose id is the definition ref', () => {
    useIndicatorStore.getState().addPine('src', pine, { length: 3 });
    expect(useIndicatorStore.getState().items[0]).toMatchObject({ id: 'pine:aaaaaaaaaaaa@1', inputs: { length: 3 }, pine: { source: 'src', definition: pine } });
  });

  it('replaces the script keeping key and presentation, dropping inputs the new script lacks', () => {
    const { addPine, replacePine, setPresentation } = useIndicatorStore.getState();
    addPine('v1', pine, { length: 3, mult: 4 });
    const key = useIndicatorStore.getState().items[0]?.key ?? '';
    setPresentation(key, defaultPresentation(pine));
    const next = { ...pine, ref: 'pine:bbbbbbbbbbbb@1', id: 'bbbbbbbbbbbb', inputs: pine.inputs.filter(input => input.id === 'length') };
    replacePine(key, 'v2', next);
    const [item] = useIndicatorStore.getState().items;
    expect(item).toMatchObject({ key, id: 'pine:bbbbbbbbbbbb@1', inputs: { length: 3 }, pine: { source: 'v2' } });
    expect(useIndicatorStore.getState().presentation[key]).toBeDefined();
  });
});
