import { describe, expect, it } from 'vitest';
import { parseDerivMessage, derivRequest } from './deriv.messages';

describe('FR-MD-1 Deriv messages', () => {
  it('parses ticks, subscription ids, candles and errors', () => {
    expect(parseDerivMessage(JSON.stringify({ tick: { symbol: 'frxEURUSD', epoch: 12, quote: 1.2 }, subscription: { id: 's1' } })))
      .toMatchObject({ tick: { symbol: 'frxEURUSD', epoch: 12, quote: 1.2 }, subscription: { id: 's1' } });
    expect(parseDerivMessage('{"candles":[{"epoch":60,"open":1,"high":2,"low":1,"close":2}]}').candles).toHaveLength(1);
    expect(parseDerivMessage('{"error":{"code":"MarketIsClosed","message":"closed"}}').error?.code).toBe('MarketIsClosed');
    expect(() => parseDerivMessage('{"tick":{"epoch":"bad"}}')).toThrow();
  });
  it('builds subscribe, forget, ping and history requests', () => {
    expect(derivRequest.subscribe('frxEURUSD', 1)).toEqual({ ticks: 'frxEURUSD', subscribe: 1, req_id: 1 });
    expect(derivRequest.forget('s1')).toEqual({ forget: 's1' });
    expect(derivRequest.ping()).toEqual({ ping: 1 });
    expect(derivRequest.history('frxEURUSD', 60, 299, 2)).toEqual({ ticks_history: 'frxEURUSD', style: 'candles', granularity: 60, end: 299, count: 1000, req_id: 2 });
  });
});

describe('Deriv tick bid and ask', () => {
  it('parses bid and ask when present and tolerates their absence', () => {
    expect(parseDerivMessage(JSON.stringify({ tick: { symbol: 'frxEURUSD', epoch: 1, quote: 1.1, bid: 1.0999, ask: 1.1001 } })).tick).toMatchObject({ bid: 1.0999, ask: 1.1001 });
    expect(parseDerivMessage(JSON.stringify({ tick: { symbol: 'frxEURUSD', epoch: 1, quote: 1.1 } })).tick?.bid).toBeUndefined();
  });
});
