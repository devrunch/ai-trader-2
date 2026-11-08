import type { InstrumentId } from './instrument-id.js';

export type InstrumentType = 'stock' | 'index' | 'futures' | 'option' | 'forex' | 'metal' | 'commodity' | 'etf' | 'bond';
export type InstrumentStatus = 'active' | 'suspended' | 'delisted' | 'expired';

export interface Instrument {
  id: InstrumentId;
  exchange: string;
  ticker: string;
  description: string;
  type: InstrumentType;
  currency: string;
  timezone: string;
  session: string;
  pricescale: number;
  minmov: number;
  lotSize: number;
  expiry?: string;
  strike?: number;
  optionType?: 'CE' | 'PE';
  underlying?: InstrumentId;
  isin?: string;
  sector?: string;
  hasIntraday: boolean;
  volumeType: 'real' | 'tick' | 'none';
  status: InstrumentStatus;
  aliases: readonly string[];
}
