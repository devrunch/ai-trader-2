import { describe, expect, it } from 'vitest';
import type { IndicatorChartInstance, IndicatorSpec } from '@aitrader/contracts';
import { resolveChain } from './source-chain';

const spec = (id: string, inputs: Record<string, never | string | number | { from: string; plot: string }> = {}): IndicatorSpec => ({ kind: 'builtin', id, inputs });
const on = (instanceId: string, label: string, id: string, from?: string, plot = 'ma'): IndicatorChartInstance =>
  ({ instanceId, label, indicator: spec(id, from ? { source: { from, plot } } : {}) });
const target = (id: string, from: string, plot: string, extra: Partial<Parameters<typeof resolveChain>[0]> = {}) =>
  ({ indicator: spec(id, { source: { from, plot } }), ...extra });

// FR-IN-13
describe('resolveChain', () => {
  it('returns a node without a parent for price sources', () => {
    expect(resolveChain({ indicator: spec('sma', { source: 'hl2' }) })).toEqual({ spec: spec('sma', { source: 'hl2' }), label: 'sma' });
  });

  it('follows A -> B -> C through the chart\'s other indicators', () => {
    const chain = resolveChain(target('sma', 'b', 'ma', { instanceId: 'c', label: 'SMA 9', others: [on('b', 'EMA 20', 'ema', 'a', 'rsi'), on('a', 'RSI 14', 'rsi')] }));
    expect(chain.label).toBe('SMA 9');
    expect(chain.parent?.node.label).toBe('EMA 20');
    expect(chain.parent?.node.parent?.node).toMatchObject({ label: 'RSI 14' });
    expect(chain.parent?.node.parent?.node.parent).toBeUndefined();
  });

  it('rejects a cycle and names the indicators', () => {
    const request = target('sma', 'b', 'ma', { instanceId: 'a', label: 'SMA 9', others: [on('b', 'EMA 20', 'ema', 'a')] });
    expect(() => resolveChain(request)).toThrow('Indicators form a cycle: SMA 9 -> EMA 20 -> SMA 9');
  });

  it('rejects a cycle that does not include the target', () => {
    const request = target('sma', 'b', 'ma', { others: [on('b', 'EMA 20', 'ema', 'c'), on('c', 'WMA 5', 'wma', 'b')] });
    expect(() => resolveChain(request)).toThrow('Indicators form a cycle: EMA 20 -> WMA 5 -> EMA 20');
  });

  it('rejects an indicator that feeds itself', () => {
    expect(() => resolveChain(target('sma', 'a', 'ma', { instanceId: 'a', label: 'SMA 9', others: [on('a', 'SMA 9', 'sma')] }))).toThrow('SMA 9 -> SMA 9');
  });

  it('accepts a chain of five and rejects six (depth cap)', () => {
    const five = [on('b', 'B', 'sma', 'c'), on('c', 'C', 'sma', 'd'), on('d', 'D', 'sma', 'e'), on('e', 'E', 'sma')];
    expect(() => resolveChain(target('sma', 'b', 'ma', { others: five }))).not.toThrow();
    const six = [on('b', 'B', 'sma', 'c'), on('c', 'C', 'sma', 'd'), on('d', 'D', 'sma', 'e'), on('e', 'E', 'sma', 'f'), on('f', 'F', 'sma')];
    expect(() => resolveChain(target('sma', 'b', 'ma', { others: six }))).toThrow('sources are chained more than 5 deep');
  });

  it('says the source is unavailable when the parent is not on the chart (E28)', () => {
    const run = () => resolveChain(target('sma', 'gone', 'rsi', { label: 'SMA 9' }));
    expect(run).toThrow('SMA 9: source unavailable');
    try { run(); } catch (error) { expect(error).toMatchObject({ details: { reason: 'SOURCE_UNAVAILABLE', from: 'gone', input: 'source' } }); }
  });

  it('rejects a plot the parent does not have, two source refs, and Pine', () => {
    expect(() => resolveChain(target('sma', 'a', 'nope', { others: [on('a', 'RSI 14', 'rsi')] }))).toThrow('RSI 14 has no plot "nope"');
    expect(() => resolveChain({ indicator: spec('sma', { source: { from: 'a', plot: 'rsi' }, other: { from: 'a', plot: 'rsi' } }), others: [on('a', 'RSI', 'rsi')] }))
      .toThrow('only one input can take another indicator');
    expect(() => resolveChain({ indicator: { kind: 'pine', source: '//@version=6', inputs: { source: { from: 'a', plot: 'rsi' } } } })).toThrow('Pine scripts cannot take');
  });
});
