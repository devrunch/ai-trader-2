# Day trader: exit planner
Stop and target are set before the entry, never after.
Needs: 5-minute bars, ATR, and the entry price.

- **Stop.** The tighter of: the other side of the opening range (or its midpoint for a tighter plan), the trigger bar's low (long) or high (short), or entry minus 1 × ATR(14) on 5m from `getIndicator`. It must be on the correct side of the entry.
- **Target.** At least 2 × the risk per share from the entry, or the next level (load `chart` with `loadTools`, then `proposeDrawing` with levels) if that is closer and still at least 1.5 × risk.
- Show plain numbers only: entry, stop, target, risk per share, reward:risk, all from `calculate`; `presentTradePlan` shows them as a card with the server's reward:risk.
- Never move a stop further from the entry once the trade is on. Moving it closer (trailing) is fine and must be said.
- A target is a plan, not a prediction.
