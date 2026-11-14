# India opening gap playbook
Classify the 09:15 IST opening gap for NSE stocks and indices and choose fade or continuation.
Markets: india

1. `getMarketStatus` for NSE: only trade a gap on the first session after a close; after a holiday or weekend the gap includes the whole break.
2. `getQuote` and `getBars` 1D: gap % and gap in ATR units with `calculate`. Under 0.3% is noise.
3. Cause: `getNews`, `getEconomicCalendar` for global cues (the US close, Asia open, SGX or GIFT Nifty if in the news), results, block deals. Use `getSentiment` for tone.
4. Wait for the first 15 minutes; mark the opening-range high and low. Continuation: break of the range in the gap's direction with volume. Fade: failure back inside the range.
5. `getDepth` before entering a stock: skip when the book is thin.
6. Target the previous close for a fade, 1.5 × the opening range for a continuation; stop on the other side of the range. Size with risk-atr-correlation. Paper only.
