import { describe, expect, it } from 'vitest';
import { InstrumentHistory } from './instrument-history';
import { instrument, repository } from './instruments.spec-helper';

describe('FR-MD-1 FR-MD-2 instrument history routing', () => {
  it('returns mappings with canonical volume metadata', async () => {
    const repo = repository(); const signal = new AbortController().signal;
    repo.getMapping.mockResolvedValue({ id: 'NSE:NIFTY', provider: 'kite', providerSymbol: 'NIFTY 50' });
    repo.findById.mockResolvedValue(instrument('NSE:NIFTY', { volumeType: 'none' }));
    expect(await new InstrumentHistory(repo, []).getMapping('NSE:NIFTY', 'kite', signal))
      .toEqual({ id: 'NSE:NIFTY', provider: 'kite', providerSymbol: 'NIFTY 50', volumeType: 'none' });
    repo.findById.mockResolvedValue(null);
    expect(await new InstrumentHistory(repo, []).getMapping('NSE:NIFTY', 'kite', signal)).toBeUndefined();
    repo.getMapping.mockResolvedValue(undefined);
    expect(await new InstrumentHistory(repo, []).getMapping('NSE:NIFTY', 'kite', signal)).toBeUndefined();
  });
  it('holds only active popular instruments with Kite mappings', async () => {
    const repo = repository(); const signal = new AbortController().signal;
    repo.activeAmong.mockResolvedValue(new Set(['NSE:TEST', 'NASDAQ:AAPL']));
    repo.getMapping.mockImplementation(id => Promise.resolve(id === 'NSE:TEST'
      ? { id, provider: 'kite', providerSymbol: 'TEST' } : undefined));
    expect(await new InstrumentHistory(repo, ['NSE:TEST', 'NSE:INACTIVE', 'NASDAQ:AAPL']).held(signal)).toEqual(['NSE:TEST']);
    expect(repo.getMapping).not.toHaveBeenCalledWith('NSE:INACTIVE', 'kite', signal);
  });
  it('holds popular instruments mapped to any live feed vendor (FR-MD-5)', async () => {
    const repo = repository(); const signal = new AbortController().signal;
    repo.activeAmong.mockResolvedValue(new Set(['NSE:TEST', 'OANDA:XAUUSD', 'NASDAQ:AAPL']));
    repo.getMapping.mockImplementation((id, provider) => Promise.resolve(
      (id === 'NSE:TEST' && provider === 'kite') || (id === 'OANDA:XAUUSD' && provider === 'deriv')
        || (id === 'NASDAQ:AAPL' && provider === 'us-delayed') ? { id, provider, providerSymbol: 'mapped' } : undefined));
    expect(await new InstrumentHistory(repo, ['NSE:TEST', 'OANDA:XAUUSD', 'NASDAQ:AAPL']).heldForFeeds(signal))
      .toEqual(['NSE:TEST', 'OANDA:XAUUSD', 'NASDAQ:AAPL']);
  });
});
