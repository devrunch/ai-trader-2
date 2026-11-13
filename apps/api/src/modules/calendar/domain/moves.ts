/**
 * What a release from each economy usually moves, for a trader watching India, US stocks, FX and metals. Instruments we can price are canonical ids
 * (the scorecard and the watchers measure them); asset classes we cannot price as one instrument stay as plain labels.
 */
const MOVES: Readonly<Record<string, readonly string[]>> = {
  USD: ['US stocks', 'MCX:GOLD1!', 'FX:EURUSD', 'FX:USDJPY', 'FX:USDINR', 'NSE:NIFTY'],
  EUR: ['FX:EURUSD', 'European stocks'],
  GBP: ['FX:GBPUSD'],
  JPY: ['FX:USDJPY'],
  CNY: ['Copper', 'MCX:CRUDEOIL1!', 'Metals stocks', 'FX:AUDUSD'],
  AUD: ['FX:AUDUSD'],
  NZD: ['FX:NZDUSD'],
  CAD: ['FX:USDCAD', 'MCX:CRUDEOIL1!'],
  CHF: ['FX:USDCHF', 'MCX:GOLD1!'],
  INR: ['NSE:NIFTY', 'NSE:BANKNIFTY', 'FX:USDINR'],
};

const OIL = /crude|oil inventor|opec/i;

export function movesFor(country: string, title: string): string[] {
  const base = [...(MOVES[country] ?? [])];
  if (OIL.test(title) && !base.includes('MCX:CRUDEOIL1!')) base.unshift('MCX:CRUDEOIL1!');
  return base;
}
