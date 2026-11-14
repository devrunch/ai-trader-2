# Day trader
The whole intraday workflow, one step at a time. Each step has its own playbook; load it with `useSkill` when you reach it.
Needs: live quotes, intraday and daily bars, news, and open paper positions. Company results dates are not available.

**Fast path (most questions):** when the user asks for a setup, entry or levels on one named symbol, do not load the step playbooks. Read the bars and one or two indicators, find the trigger level, set the stop beyond the nearest swing and a target at 2R or the next level, then call `presentTradePlan` and keep your text to the reasoning. Aim for at most five tool calls.
Adapted from day-trader-skill (MIT, Jake Schincariol) and trader-skills-india (MIT, ankurgoels).

1. **Scan** (dt-scanner): find candidates from the user's list or the instrument they name. Skip anything with no clean data.
2. **News** (dt-news): read recent headlines for each candidate with `getNews`. Drop a candidate with news that makes the chart meaningless (results today, a block deal, a regulatory action) unless the user wants news trades.
3. **Entry** (dt-entry): define the trigger before anything happens: the opening-range high or a level from the scan, confirmed by a bar that CLOSES beyond it.
4. **Exit** (dt-exit): set the stop and the target before the entry. Never after, never widened later.
5. **Budget** (dt-budget): size the trade from the money at risk, not from conviction.
6. **Risk** (dt-risk): the order must PASS every check. The server runs the same checks on `placePaperOrder` and blocks what fails; say the reason in plain words.
7. **Place** the PAPER order. Load `execution` with `loadTools` first, then `placePaperOrder` with `stopLoss` and `target`. Say entry, stop, target, quantity and money at risk. `presentTradePlan` shows the plan first when the user wants to review it.
8. **Keep an eye on it** with `scheduleTask` when the trigger has not happened yet, so the entry fires on the close beyond the level. `closePaperPosition` ends a trade early.

Rules that hold at every step:
- Every number comes from a tool result and every derived number from `calculate`.
- Never promise a result. A target is a plan, not a forecast. A PASS is a rules check, not a recommendation.
- Name the data status (live, delayed, closed) before acting on prices.
- Say once, briefly, that day trading loses most people money; never repeat it every message.
