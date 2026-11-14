# Gap trading
Classify the opening gap first; fades and continuations are opposite trades.
Needs: daily bars, a quote, ATR, news, the economic calendar, and years of history for the test.

1. `getBars` on 1D and `getQuote`. Gap % = (open − previous close) ÷ previous close × 100, and gap in ATR units = |open − previous close| ÷ ATR(14) from `getIndicator`. Use `calculate` for both. Call it a full gap if the open is beyond the prior high or low.
2. Gap smaller than total round-trip cost (spread, fees, slippage) means no trade.
3. `getNews` and `getEconomicCalendar` for the cause: results, guidance, deal, macro, global cues. Company results dates are not in the calendar; take an announced date from `getNews` and treat it as unconfirmed. Event-driven gaps are treated separately from no-news gaps.
4. Classify: inside an established range with no news, test a fade; clearing a key level with heavy volume, test a continuation; after an extended trend, test both separately.
5. Fade: wait for a failed break or a reversal bar on a closed candle, target the previous close as a scenario, not an assumed fill. Continuation: wait for the opening range (set its length in bars first), enter on its closed-bar break, stop back through the range.
6. Load `chart` with `loadTools`, then `proposeDrawing` for the gap zone. Load `strategies` and `runBacktest` on the same symbol; retain the rule only if it survives held-out costs.
7. Never widen a stop to avoid an exit; widen it only with a smaller size. Finish with `presentTradePlan`. Sizing via the position-sizing playbook, stop-loss required, and paper only.

Caveat: past results do not promise future profit; costs and small samples can erase an edge.
