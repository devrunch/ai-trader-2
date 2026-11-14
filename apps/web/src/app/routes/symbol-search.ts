import { z } from 'zod';
import { INTERVALS } from '@aitrader/contracts';

/** The symbol and interval in the address, shared by the Terminal and the agent window so switching between them keeps both. */
export const symbolSearch = z.object({
  symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!\- ]+$/).catch('NSE:NIFTY'),
  interval: z.preprocess((value) => typeof value === 'number' ? String(value) : value, z.enum(INTERVALS).catch('5')),
});
