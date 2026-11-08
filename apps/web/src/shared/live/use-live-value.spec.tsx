import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createManualScheduler, LiveStore, useLiveValue, type FrameScheduler } from './index';

describe('useLiveValue (NFR-PF-3, SRD §10.3)', () => {
  it('useLiveValue re-renders once per frame, not per set', () => {
    const scheduler = createManualScheduler();
    const frameScheduler: FrameScheduler = scheduler;
    const store = new LiveStore<number>(frameScheduler);
    let renders = 0;
    function Value() {
      const value = useLiveValue(store, 'NSE:X');
      renders++;
      return <span>{value ?? 'empty'}</span>;
    }
    render(<Value />);
    expect(renders).toBe(1);
    act(() => {
      for (let i = 0; i < 100; i++) store.set('NSE:X', i);
    });
    expect(renders).toBe(1);
    act(() => { scheduler.flush(); });
    expect(renders).toBe(2);
    expect(screen.getByText('99')).toBeDefined();
  });

  it('useLiveValue switches keys cleanly', () => {
    const scheduler = createManualScheduler();
    const store = new LiveStore<number>(scheduler);
    store.set('a', 1);
    store.set('b', 2);
    scheduler.flush();
    let renders = 0;
    function Value({ symbol }: { symbol: string }) {
      const value = useLiveValue(store, symbol);
      renders++;
      return <span>{value}</span>;
    }
    const view = render(<Value symbol="a" />);
    expect(screen.getByText('1')).toBeDefined();
    view.rerender(<Value symbol="b" />);
    expect(screen.getByText('2')).toBeDefined();
    const before = renders;
    act(() => { store.set('a', 3); scheduler.flush(); });
    expect(renders).toBe(before);
    act(() => { store.set('b', 4); scheduler.flush(); });
    expect(renders).toBe(before + 1);
    expect(screen.getByText('4')).toBeDefined();
  });
});
