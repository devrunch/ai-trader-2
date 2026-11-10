import { describe, expect, it, vi } from 'vitest';
import { KitePreviousCloseSource } from './kite-previous-close.source';

const signal = () => new AbortController().signal;
function source(reply: unknown, mapping: { providerSymbol: string } | undefined = { providerSymbol: 'NSE:RELIANCE' }) {
  const client = { setAccessToken: vi.fn(), getOHLC: vi.fn().mockResolvedValue(reply) };
  const take = vi.fn().mockResolvedValue(undefined);
  const s = new KitePreviousCloseSource({ getAccessToken: vi.fn().mockResolvedValue('token') },
    { getMapping: vi.fn().mockResolvedValue(mapping) }, { take }, () => client);
  return { s, client, take };
}

describe('KitePreviousCloseSource (no real Kite calls)', () => {
  it('reads ohlc.close for the Kite symbol, rate limited', async () => {
    const f = source({ 'NSE:RELIANCE': { instrument_token: 738561, last_price: 1325, ohlc: { open: 1316, high: 1330, low: 1305, close: 1316 } } });
    expect(await f.s.fetch('NSE:RELIANCE', signal())).toBe(1316);
    expect(f.client.getOHLC).toHaveBeenCalledWith(['NSE:RELIANCE']);
    expect(f.take).toHaveBeenCalledOnce();
  });

  it('returns null without a Kite mapping, an empty reply or a zero close', async () => {
    expect(await source({}, undefined).s.fetch('FX:EURUSD', signal())).toBeNull();
    expect(await source({}).s.fetch('NSE:RELIANCE', signal())).toBeNull();
    expect(await source({ 'NSE:RELIANCE': { ohlc: { close: 0 } } }).s.fetch('NSE:RELIANCE', signal())).toBeNull();
  });
});
