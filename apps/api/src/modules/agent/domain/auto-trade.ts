import type { AutoTrade } from '@aitrader/contracts';

/** The reasons an automatic entry is refused; empty when it may go ahead. The risk gate (stop, reward:risk, loss limits) runs as well. */
export function autoTradeBlocks(limits: AutoTrade, input: { riskAmount: number | null; initialCash: number; tradesToday: number; backtest: string | null }): string[] {
  const blocks: string[] = [];
  if (input.riskAmount === null) blocks.push('auto-trade needs a stop to size the risk');
  else if (input.initialCash > 0 && (input.riskAmount / input.initialCash) * 100 > limits.maxRiskPct) {
    blocks.push(`risk ${((input.riskAmount / input.initialCash) * 100).toFixed(2)}% of the account is over this task's ${String(limits.maxRiskPct)}% limit`);
  }
  if (input.tradesToday >= limits.maxTradesPerDay) blocks.push(`already ${String(input.tradesToday)} trades today; this task allows ${String(limits.maxTradesPerDay)}`);
  if (limits.requireBacktest && input.backtest === null) blocks.push('this task requires a backtest in the same run; call runBacktest first');
  return blocks;
}
