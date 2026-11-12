# Breakout trade plan
Turn a confirmed pivot setup into entry, stop, target and size, with a cap on total open risk.

1. Start from a setup the vcp-setup or momentum-burst skill passed: pivot, last contraction low, and the breakout volume check.
2. `getQuote` for the live price. Trigger = pivot × 1.001 (small buffer). Worst-case entry = pivot × 1.02; do not chase beyond it. Use `calculate`.
3. Stop = last contraction low × 0.99. Risk % = (worst-case entry − stop) ÷ worst-case entry × 100. Reject when above 8%.
4. Target = worst-case entry + 2 × (worst-case entry − stop), a 2R target. Reject when reward to risk is under 2.
5. `getPortfolio` for open paper positions.
   Base risk is 0.5% of equity per trade; total open risk across positions must stay at or under 6% and one position at or under 10% of equity.
   Reduce or skip when a cap is hit. Size from the worst-case entry with the position-sizing skill.
6. Before the trigger, `createAlert` at the trigger price.
   After it, confirm the move held for about 5 minutes with volume, using `getBars` 5m, before acting.
7. Output: trigger, worst-case entry, stop, target, quantity, risk in rupees and percent.
   Stop-loss required; sizing via the position-sizing skill; paper only. No outcome is promised.
