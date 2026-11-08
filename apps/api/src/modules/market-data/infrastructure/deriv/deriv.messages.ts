import { z } from 'zod';

const number = z.number();
const message = z.object({
  req_id: z.number().int().optional(),
  tick: z.object({ symbol: z.string(), epoch: number.nonnegative(), quote: number }).optional(),
  subscription: z.object({ id: z.string() }).optional(),
  candles: z.array(z.object({ epoch: number.nonnegative(), open: number, high: number, low: number, close: number })).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export function parseDerivMessage(text: string) { const value: unknown = JSON.parse(text); return message.parse(value); }
export const derivRequest = {
  subscribe: (symbol: string, id: number) => ({ ticks: symbol, subscribe: 1, req_id: id }),
  forget: (id: string) => ({ forget: id }),
  ping: () => ({ ping: 1 }),
  history: (symbol: string, granularity: 60 | 86400, end: number, id: number) => ({
    ticks_history: symbol, style: 'candles', granularity, end, count: 1000, req_id: id,
  }),
};
