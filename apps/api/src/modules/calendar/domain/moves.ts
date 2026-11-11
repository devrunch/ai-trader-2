/** What a release from each economy usually moves, for a trader watching India, US stocks, FX and metals. */
const MOVES: Readonly<Record<string, readonly string[]>> = {
  USD: ['US stocks', 'Gold', 'EUR/USD', 'USD/JPY', 'USD/INR', 'NIFTY (via FII flows)'],
  EUR: ['EUR/USD', 'European stocks'],
  GBP: ['GBP/USD'],
  JPY: ['USD/JPY'],
  CNY: ['Copper', 'Crude oil', 'Metals stocks', 'AUD/USD'],
  AUD: ['AUD/USD'],
  NZD: ['NZD/USD'],
  CAD: ['USD/CAD', 'Crude oil'],
  CHF: ['USD/CHF', 'Gold'],
  INR: ['NIFTY', 'BANKNIFTY', 'USD/INR'],
};

const OIL = /crude|oil inventor|opec/i;

export function movesFor(country: string, title: string): string[] {
  const base = [...(MOVES[country] ?? [])];
  if (OIL.test(title) && !base.includes('Crude oil')) base.unshift('Crude oil', 'MCX:CRUDEOIL');
  return base;
}
