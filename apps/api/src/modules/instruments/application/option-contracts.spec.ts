import { describe, expect, it } from 'vitest';
import { OptionContractList } from './option-contracts';
import { repository } from './instruments.spec-helper';

const signal = new AbortController().signal;
const CONTRACT = { providerSymbol: 'NFO:NIFTY2611924500CE', strike: 24500, optionType: 'CE' as const, expiry: '2026-11-19' };

describe('option contract list', () => {
  it('returns the contracts with the vendor symbol of the spot price', async () => {
    const repo = repository();
    repo.listOptionContracts.mockResolvedValue([CONTRACT]);
    repo.getMapping.mockResolvedValue({ id: 'NSE:NIFTY', provider: 'kite', providerSymbol: 'NSE:NIFTY 50' });
    expect(await new OptionContractList(repo).list('NIFTY', '2026-11-14', signal)).toEqual({ spotSymbol: 'NSE:NIFTY 50', contracts: [CONTRACT] });
    expect(repo.listOptionContracts).toHaveBeenCalledWith('NSE:NIFTY', '2026-11-14', signal);
  });
  it('returns null for an underlying with no active option contracts', async () => {
    expect(await new OptionContractList(repository()).list('TCS', '2026-11-14', signal)).toBeNull();
  });
});
