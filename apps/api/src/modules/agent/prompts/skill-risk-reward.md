# Risk and reward plan
Before any paper entry, write the plan in numbers.
Needs: a quote, chart levels or ATR.

- Entry, stop and target, each from a tool result (`getQuote`, levels, `getIndicator` ATR).
- Risk = |entry − stop|, reward = |target − entry|, ratio = reward ÷ risk. Use `calculate` for the arithmetic, and `presentTradePlan` to show the plan: the server computes reward:risk and size.
- Skip the trade, and say why, when the ratio is below 1.5 unless the user insists.
- After the user agrees, load `execution` with `loadTools`, then place the order with `placePaperOrder` with `stopLoss` and `target` set, so the exit is automatic. Paper only.
- Never quote a win rate or expected return without the sample size, the period, costs and the maximum drawdown.
