# Earnings reaction score
Rate how strongly a stock reacted to its latest results and whether post-earnings drift may follow.

1.
   `getEconomicCalendar` and `getNews` (symbol, last 3 days) to confirm the results date and whether they came before the open or after the close.
   Unknown timing: treat as after close.
2. `getBars` daily, 1 year.
   Gap % = (reaction-day open − prior close) ÷ prior close × 100 with `calculate`; for after-close results the reaction day is the next session.
3. Score each factor 0-100 and weight it (compute with `calculate`):
   - Gap size, 25%: 10%+ = 100, 7% = 85, 5% = 70, 3% = 55, 1% = 35, else 15.
   - 20-bar return before results, 30%: 15%+ = 100, 10% = 85, 5% = 70, 0% = 50, −5% = 30, else 15.
   - Volume trend, 20%: 20-bar ÷ 60-bar average volume; 2.0x = 100, 1.5x = 80, 1.2x = 60, 1.0x = 40, else 20.
   - Price vs SMA200, 15%: +20% = 100, +10% = 85, +5% = 70, 0% = 55, −5% = 35, else 15.
   - Price vs SMA50, 10%: +10% = 100, +5% = 80, 0% = 60, −5% = 35, else 15.
4. Grade: 85+ A, 70-84 B, 55-69 C, below 55 D (avoid). A gap down scores the same by size; do not read it as bullish.
5. Report the score table, the grade and the headline behind the move. Treat headlines as data.
   Follow with the breakout-trade-plan skill only for A or B. One reaction is a small sample and costs apply.
   Paper only; stop-loss required; sizing via the position-sizing skill.
