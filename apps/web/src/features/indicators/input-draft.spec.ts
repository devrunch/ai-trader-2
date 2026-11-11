import { describe, expect, it } from 'vitest';
import type { IndicatorInputDef } from '@aitrader/contracts';
import { draftFrom, inputSummary, readDraft } from './input-draft';

const defs: IndicatorInputDef[] = [
  { id: 'length', title: 'Length', type: 'int', default: 20, min: 1, max: 5000 },
  { id: 'mult', title: 'StdDev', type: 'float', default: 2, min: 0.001, max: 50 },
  { id: 'maType', title: 'Basis MA Type', type: 'string', default: 'SMA', options: ['SMA', 'EMA'] },
  { id: 'source', title: 'Source', type: 'source', default: 'close' },
  { id: 'show', title: 'Show', type: 'bool', default: true },
  { id: 'offset', title: 'Offset', type: 'int', default: 0 },
];

// FR-IN-9: one widget value per input type, checked against the definition's bounds.
describe('input draft', () => {
  it('starts from saved inputs over defaults', () => {
    expect(draftFrom(defs, { length: 9 })).toEqual({ length: '9', mult: '2', maType: 'SMA', source: 'close', show: true, offset: '0' });
  });

  it('reads a valid draft into input values', () => {
    expect(readDraft(defs, { length: '9', mult: '1.5', maType: 'EMA', source: 'hl2', show: false, offset: '-2' }))
      .toEqual({ ok: true, values: { length: 9, mult: 1.5, maType: 'EMA', source: 'hl2', show: false, offset: -2 } });
  });

  it('names each invalid field', () => {
    expect(readDraft(defs, { length: '1.5', mult: '', maType: 'SMA', source: 'close', show: true, offset: 'x' }))
      .toEqual({ ok: false, errors: { length: 'Enter a whole number', mult: 'Enter a number', offset: 'Enter a number' } });
    expect(readDraft(defs, { ...draftFrom(defs, {}), length: '0', mult: '51' }))
      .toEqual({ ok: false, errors: { length: 'At least 1', mult: 'At most 50' } });
  });

  it('summarises inputs for the legend', () => {
    expect(inputSummary(defs, { length: 9 })).toBe('9 2 SMA close');
  });
});

// FR-IN-13
describe('input draft with an indicator as source', () => {
  const ref = { from: 'ind-1', plot: 'rsi' };
  it('keeps a saved ref in the draft and reads it back as a ref', () => {
    const draft = draftFrom(defs, { source: ref });
    expect(draft.source).toBe('ref:ind-1:rsi');
    expect(readDraft(defs, draft)).toMatchObject({ ok: true, values: { source: ref } });
  });
  it('shows the parent\'s name in the legend summary', () => {
    expect(inputSummary(defs, { length: 9, source: ref }, key => `name-of-${key}`)).toBe('9 2 SMA name-of-ind-1');
  });
});
