const INR_EXCHANGES = new Set(['NSE', 'BSE', 'NFO', 'BFO', 'MCX', 'CDS']);
const USD_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'CBOE', 'COMEX', 'NYMEX', 'BINANCE']);
const FX_EXCHANGES = new Set(['FX', 'OANDA', 'FOREXCOM']);

/** The currencies whose releases move these symbols: an Indian listing moves on INR releases, a US one on USD, a currency pair on both legs. */
export function currenciesOf(symbols: readonly string[]): string[] {
  const out = new Set<string>();
  for (const symbol of symbols) {
    const [exchange = '', ticker = ''] = symbol.split(':');
    if (INR_EXCHANGES.has(exchange)) out.add('INR');
    else if (USD_EXCHANGES.has(exchange)) out.add('USD');
    else if (FX_EXCHANGES.has(exchange) && /^[A-Z]{6}$/.test(ticker)) { out.add(ticker.slice(0, 3)); out.add(ticker.slice(3)); }
  }
  return [...out];
}

const IST = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

/** The task title the user sees: plain, with the release time in IST. */
export const releaseTaskTitle = (event: { title: string; at: string }): string => `Watching ${event.title}, out at ${IST.format(new Date(event.at))} IST`;

/** One task covers a release end to end: a brief before it, the report at it, and what to do after. */
export const RELEASE_INSTRUCTION = 'This is a high-impact release for the markets I follow. '
  + 'Before it: give a short brief with both branches (above and below forecast), what each would likely mean for my markets, and which of my open positions and tasks are at risk. '
  + 'At the release: report the actual against the forecast and the first move, in a few lines. '
  + 'After it: act on my tasks tied to this release within my limits (paper fills are worse around releases, so prefer limit orders), and if the move is still developing, '
  + 'schedule one follow-up in 15 to 30 minutes with scheduleTask.';

/** Brief this long before the release, and report this long after (the first move, not the settled one). */
export const RELEASE_BRIEF_MINUTES = 30;
export const RELEASE_AFTER_MINUTES = 2;
