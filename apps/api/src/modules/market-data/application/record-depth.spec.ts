import { describe, expect, it, vi } from 'vitest';
import type { Depth } from '@aitrader/contracts';
import type { Tick } from './ports/live-feed';
import { RecordDepth } from './record-depth';

const book = (bid: number): NonNullable<Tick['book']> => ({ levels: '5', bids: [{ price: bid, quantity: 10, orders: 1 }], asks: [{ price: bid + 1, quantity: 30, orders: 2 }] });
const tick = (at: number, extra: Partial<Tick> = {}): Tick => ({ instrumentId: 'NSE:TEST', at, price: 100, cumVolume: null, book: book(100), ...extra });
function setup(set = vi.fn<(id: string, depth: Depth) => Promise<void>>().mockResolvedValue(undefined)) {
  let now = 0; let emit: (t: Tick) => void = () => undefined; const log = vi.fn();
  const recorder = new RecordDepth({ get: () => Promise.resolve(null), set }, { clock: () => now, log });
  const off = vi.fn();
  const detach = recorder.attach({ name: 'kite', onTick: listener => { emit = listener; return off; } });
  return { set, log, off, detach, emit: (t: Tick) => { emit(t); }, advance: (ms: number) => { now += ms; } };
}

describe('RecordDepth', () => {
  it('writes the book of a tick with the feed as source', () => {
    const { set, emit } = setup();
    emit(tick(5000));
    expect(set).toHaveBeenCalledOnce();
    expect(set.mock.calls[0]?.[1]).toMatchObject({ instrumentId: 'NSE:TEST', at: 5000, source: 'kite', spread: 1, totalBidQty: 10, totalAskQty: 30, imbalance: -0.5 });
  });
  it('writes at most twice a second per instrument', () => {
    const { set, emit, advance } = setup();
    emit(tick(1)); advance(499); emit(tick(2)); expect(set).toHaveBeenCalledTimes(1);
    advance(1); emit(tick(3)); expect(set).toHaveBeenCalledTimes(2);
    emit(tick(4, { instrumentId: 'NSE:OTHER' })); expect(set).toHaveBeenCalledTimes(3);
  });
  it('ignores ticks without a book and books with no priced level', () => {
    const { set, emit } = setup();
    emit({ instrumentId: 'NSE:TEST', at: 1, price: 100, cumVolume: null });
    emit(tick(2, { book: { levels: '5', bids: [{ price: 0, quantity: 0, orders: 0 }], asks: [] } }));
    expect(set).not.toHaveBeenCalled();
  });
  it('logs a failed write and keeps going', async () => {
    const { log, emit, advance } = setup(vi.fn().mockRejectedValueOnce(new Error('redis down')).mockResolvedValue(undefined));
    emit(tick(1)); await Promise.resolve(); await Promise.resolve();
    expect(log).toHaveBeenCalledWith('depth write failed', expect.any(Error));
    advance(500); emit(tick(2)); // no throw
  });
  it('stops listening on detach', () => {
    const { off, detach } = setup(); expect(off).not.toHaveBeenCalled(); detach(); expect(off).toHaveBeenCalledOnce();
  });
});
