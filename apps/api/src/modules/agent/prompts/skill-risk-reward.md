# Risk and reward plan
Before any paper entry, write the plan in numbers.

- Entry, stop and target, each from a tool result (quote, levels, ATR).
- Risk = |entry − stop|, reward = |target − entry|, ratio = reward ÷ risk. Use `calculate`.
- Skip the trade, and say why, when the ratio is below 1.5 unless the user insists.
- Place the order with `placePaperOrder` with `stopLoss` and `target` set, so the exit is automatic.
- Never quote a win rate or expected return without the sample size, the period, costs and the maximum drawdown.
