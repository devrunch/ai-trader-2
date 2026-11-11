/** Words and names that tie a headline to an instrument. Matched as whole words, case-insensitively. */
export interface TagRule { symbol: string; terms: string[] }

const DEFAULT_RULES: TagRule[] = [
  { symbol: 'NSE:NIFTY', terms: ['nifty', 'nifty 50', 'nifty50'] },
  { symbol: 'NSE:BANKNIFTY', terms: ['bank nifty', 'banknifty', 'nifty bank'] },
  { symbol: 'BSE:SENSEX', terms: ['sensex'] },
  { symbol: 'NSE:INDIAVIX', terms: ['india vix'] },
  { symbol: 'MCX:GOLD1!', terms: ['gold'] },
  { symbol: 'MCX:SILVER1!', terms: ['silver'] },
  { symbol: 'MCX:CRUDEOIL1!', terms: ['crude', 'crude oil', 'brent', 'wti', 'oil prices'] },
  { symbol: 'MCX:NATURALGAS1!', terms: ['natural gas'] },
  { symbol: 'FX:USDINR', terms: ['rupee', 'usd/inr', 'usdinr'] },
  { symbol: 'FX:EURUSD', terms: ['euro', 'eur/usd', 'eurusd', 'ecb'] },
  { symbol: 'FX:USDJPY', terms: ['yen', 'usd/jpy', 'usdjpy', 'bank of japan', 'boj'] },
  { symbol: 'FX:GBPUSD', terms: ['sterling', 'pound', 'gbp/usd', 'bank of england'] },
  { symbol: 'NASDAQ:AAPL', terms: ['apple'] },
  { symbol: 'NASDAQ:MSFT', terms: ['microsoft'] },
  { symbol: 'NASDAQ:NVDA', terms: ['nvidia'] },
  { symbol: 'NSE:RELIANCE', terms: ['reliance industries', 'ril', 'reliance'] },
  { symbol: 'NSE:TCS', terms: ['tcs', 'tata consultancy'] },
  { symbol: 'NSE:INFY', terms: ['infosys', 'infy'] },
  { symbol: 'NSE:HDFCBANK', terms: ['hdfc bank'] },
  { symbol: 'NSE:ICICIBANK', terms: ['icici bank'] },
  { symbol: 'NSE:SBIN', terms: ['sbi', 'state bank of india'] },
  { symbol: 'NSE:BHARTIARTL', terms: ['bharti airtel', 'airtel'] },
  { symbol: 'NSE:ITC', terms: ['itc'] },
  { symbol: 'NSE:LT', terms: ['larsen & toubro', 'larsen and toubro', 'l&t'] },
  { symbol: 'NSE:HINDUNILVR', terms: ['hindustan unilever', 'hul'] },
  { symbol: 'NSE:KOTAKBANK', terms: ['kotak mahindra bank', 'kotak bank'] },
  { symbol: 'NSE:AXISBANK', terms: ['axis bank'] },
  { symbol: 'NSE:BAJFINANCE', terms: ['bajaj finance'] },
  { symbol: 'NSE:MARUTI', terms: ['maruti', 'maruti suzuki'] },
  { symbol: 'NSE:TATAMOTORS', terms: ['tata motors'] },
  { symbol: 'NSE:TATASTEEL', terms: ['tata steel'] },
  { symbol: 'NSE:SUNPHARMA', terms: ['sun pharma'] },
  { symbol: 'NSE:WIPRO', terms: ['wipro'] },
  { symbol: 'NSE:HCLTECH', terms: ['hcl tech', 'hcltech', 'hcl technologies'] },
  { symbol: 'NSE:ADANIENT', terms: ['adani enterprises'] },
  { symbol: 'NSE:ASIANPAINT', terms: ['asian paints'] },
  { symbol: 'NSE:ONGC', terms: ['ongc'] },
  { symbol: 'NSE:NTPC', terms: ['ntpc'] },
  { symbol: 'NSE:POWERGRID', terms: ['power grid'] },
  { symbol: 'NSE:ULTRACEMCO', terms: ['ultratech'] },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compiles rules once; returns the instruments a piece of text mentions, in rule order, without duplicates. */
export function tagger(rules: TagRule[] = DEFAULT_RULES): (text: string) => string[] {
  const compiled = rules.map(r => ({ symbol: r.symbol, re: new RegExp(`(?<![\\w&])(?:${r.terms.map(escape).join('|')})(?![\\w&])`, 'i') }));
  return text => compiled.filter(c => c.re.test(text)).map(c => c.symbol).filter((s, i, all) => all.indexOf(s) === i);
}
