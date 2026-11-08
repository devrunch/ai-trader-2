import { describe, expect, it } from 'vitest';
import { InstrumentId, InvalidInstrumentIdError } from './index.js';

describe('FR-SY-1 canonical instrument IDs', () => {
  it('parses and formats canonical ids', () => {
    expect(InstrumentId.parse(' nse:reliance ').toString()).toBe('NSE:RELIANCE');
    expect(InstrumentId.parse('BSE:BSE SENSEX SIXTY 65:35')).toMatchObject({ exchange: 'BSE', ticker: 'BSE SENSEX SIXTY 65:35' });
    for (const raw of ['NSE:ARE&M', 'MCX:GOLD1!', 'NSE:MixedCase', 'NSE:lowercase']) {
      expect(InstrumentId.parse(raw).toString()).toBe(raw);
    }
  });

  it('rejects malformed ids', () => {
    for (const raw of ['RELIANCE', ':X', 'NSE:', 'ABCDEFGHIJKLMNOPQRSTU:X', 'NSE:RE\u0001L', `NSE:${'X'.repeat(65)}`, 'N-S:X', 'NSE:X\u007fY']) {
      expect(() => InstrumentId.parse(raw)).toThrow(InvalidInstrumentIdError);
      try {
        InstrumentId.parse(raw);
      } catch (error) {
        expect(error).toMatchObject({ raw, code: 'VALIDATION_FAILED' });
        expect(error instanceof InvalidInstrumentIdError && error.reason.length).toBeTruthy();
        expect(error instanceof Error && error.message.length).toBeTruthy();
      }
    }
  });

  it('tryParse returns null instead of throwing', () => {
    expect(InstrumentId.tryParse('invalid')).toBeNull();
    expect(InstrumentId.tryParse('nse:reliance')?.toString()).toBe('NSE:RELIANCE');
  });

  it('equals compares exchange and ticker', () => {
    const id = InstrumentId.parse('NSE:RELIANCE');
    expect(id.equals(InstrumentId.parse('nse:reliance'))).toBe(true);
    expect(id.equals(InstrumentId.parse('BSE:RELIANCE'))).toBe(false);
    expect(id.equals(InstrumentId.parse('NSE:OTHER'))).toBe(false);
  });
});
