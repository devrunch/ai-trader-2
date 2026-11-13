// Curated lists reviewed 2026-11-12 (docs/UNIVERSES.md). Members absent from the instrument master are dropped and counted, never guessed.
export const FOREX_MAJORS: readonly string[] = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD'].map(p => `FX:${p}`);
export const FOREX_CROSSES: readonly string[] = ['EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'EURCHF', 'EURAUD', 'EURCAD', 'EURNZD', 'GBPCHF', 'GBPAUD', 'GBPCAD',
  'AUDCAD', 'AUDCHF', 'AUDNZD', 'NZDJPY'].map(p => `FX:${p}`);
export const COMMODITIES: readonly string[] = ['MCX:GOLD1!', 'MCX:SILVER1!', 'MCX:CRUDEOIL1!', 'MCX:NATURALGAS1!', 'MCX:COPPER1!', 'MCX:ZINC1!',
  'OANDA:XAUUSD', 'OANDA:XAGUSD', 'OANDA:XPTUSD', 'OANDA:XPDUSD'];
const NASDAQ = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'GOOG', 'META', 'TSLA', 'AVGO', 'COST', 'NFLX', 'AMD', 'ADBE', 'PEP', 'CSCO', 'TMUS', 'INTC', 'QCOM', 'TXN', 'INTU',
  'AMAT', 'BKNG', 'AMGN', 'CMCSA', 'PANW'];
const NYSE = ['BRK.B', 'JPM', 'V', 'MA', 'WMT', 'XOM', 'LLY', 'UNH', 'JNJ', 'PG', 'HD', 'ORCL', 'BAC', 'KO', 'CVX', 'ABBV', 'CRM', 'MRK', 'MCD', 'DIS', 'IBM', 'CAT', 'GE', 'WFC', 'PM'];
export const US_LARGE: readonly string[] = [...NASDAQ.map(t => `NASDAQ:${t}`), ...NYSE.map(t => `NYSE:${t}`)];
/** No crypto instruments are in the master yet; the universe stays empty (with a note) until a source lists them under this exchange. */
export const CRYPTO_MAJORS: readonly string[] = ['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'BCHUSD', 'ADAUSD', 'SOLUSD', 'DOGEUSD'].map(t => `CRYPTO:${t}`);
