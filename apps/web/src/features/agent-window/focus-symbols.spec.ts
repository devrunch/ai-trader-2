import type { UIMessage } from 'ai';
import { expect, it } from 'vitest';
import { focusFrom } from './focus-symbols';

const msg = (role: 'user' | 'assistant', parts: unknown[]): UIMessage => ({ id: Math.random().toString(36), role, parts } as UIMessage);

it('lists the stocks a conversation is about, newest mention first, without repeats', () => {
  const { symbols } = focusFrom([
    msg('user', [{ type: 'text', text: 'Compare NSE:RELIANCE with NSE:TCS' }]),
    msg('assistant', [{ type: 'tool-getQuote', state: 'output-available', input: { symbol: 'NSE:INFY' }, output: { ok: true, data: { instrumentId: 'NSE:INFY' } } }]),
    msg('user', [{ type: 'text', text: 'and NSE:RELIANCE again' }]),
  ]);
  expect(symbols).toEqual(['NSE:RELIANCE', 'NSE:INFY', 'NSE:TCS']);
});

it('reads the assistant\'s latest call from a trade card and from a desk decision', () => {
  const { views } = focusFrom([
    msg('assistant', [{ type: 'tool-presentTradePlan', state: 'output-available', input: {},
      output: { ok: true, data: { symbol: 'NSE:RELIANCE', side: 'buy', confidence: 0.65, entry: 1335.4, stopLoss: 1331.2, targets: [1344] } } }]),
    msg('assistant', [{ type: 'tool-askDesk', state: 'output-available', input: { symbol: 'NSE:TCS' },
      output: { ok: true, data: { symbol: 'NSE:TCS', decision: { action: 'HOLD', confidence: 0.4, entry: null, stopLoss: null, target: null } } } }]),
  ]);
  expect(views.get('NSE:RELIANCE')).toEqual({ action: 'BUY', confidence: 0.65, entry: 1335.4, stopLoss: 1331.2, target: 1344 });
  expect(views.get('NSE:TCS')).toMatchObject({ action: 'HOLD', confidence: 0.4 });
});

it('keeps at most the limit, newest first', () => {
  const text = Array.from({ length: 12 }, (_, i) => `NSE:S${String(i)}`).join(' ');
  expect(focusFrom([msg('user', [{ type: 'text', text }])], 8).symbols).toHaveLength(8);
});
