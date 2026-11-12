import type { AutoTrade } from '@aitrader/contracts';

/** What the last backtest in a wake-up found; an entry is judged on it when the task requires one. */
export interface BacktestNote { symbol: string; interval: string; profitFactor: number | null; tradeCount: number; summary: string }

/** A setup is only worth trading if its backtest had enough trades and a profit factor above this (no losing trade at all counts as a pass). */
const BACKTEST_MIN_PROFIT_FACTOR = 1.1;
const BACKTEST_MIN_TRADES = 20;

/** Why a backtest does not support the entry, or null when it does. */
function backtestVerdict(note: BacktestNote): string | null {
  if (note.tradeCount < BACKTEST_MIN_TRADES) return `backtest of ${note.symbol} ${note.interval} has ${String(note.tradeCount)} trades; at least ${String(BACKTEST_MIN_TRADES)} are needed`;
  if (note.profitFactor !== null && note.profitFactor < BACKTEST_MIN_PROFIT_FACTOR) return `backtest of ${note.symbol} ${note.interval} has profit factor ${String(note.profitFactor)}, below ${String(BACKTEST_MIN_PROFIT_FACTOR)}`;
  return null;
}

/**
 * The reasons an automatic entry is refused; empty when it may go ahead. `backtestSkip` is set when the setup was backtested and failed, which is recorded in the journal as a skipped trade.
 * The risk gate (stop, reward:risk, loss limits) runs as well.
 */
export function autoTradeBlocks(limits: AutoTrade, input: { symbol: string; riskAmount: number | null; initialCash: number; tradesToday: number; backtest: BacktestNote | null }): { blocks: string[]; backtestSkip: string | null } {
  const blocks: string[] = [];
  if (input.riskAmount === null) blocks.push('auto-trade needs a stop to size the risk');
  else if (input.initialCash > 0 && (input.riskAmount / input.initialCash) * 100 > limits.maxRiskPct) {
    blocks.push(`risk ${((input.riskAmount / input.initialCash) * 100).toFixed(2)}% of the account is over this task's ${String(limits.maxRiskPct)}% limit`);
  }
  if (input.tradesToday >= limits.maxTradesPerDay) blocks.push(`already ${String(input.tradesToday)} trades today; this task allows ${String(limits.maxTradesPerDay)}`);
  let backtestSkip: string | null = null;
  if (limits.requireBacktest) {
    if (input.backtest === null) blocks.push(`this task requires a backtest of the setup first; call runBacktest for ${input.symbol}`);
    else if (input.backtest.symbol !== input.symbol) blocks.push(`the backtest was for ${input.backtest.symbol}, not ${input.symbol}; backtest this instrument first`);
    else {
      backtestSkip = backtestVerdict(input.backtest);
      if (backtestSkip) blocks.push(`no trade: ${backtestSkip}`);
    }
  }
  return { blocks, backtestSkip };
}
