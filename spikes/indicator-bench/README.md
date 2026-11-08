# Indicator engine benchmark spike (throwaway)

Results: `../../docs/benchmarks/2026-11-08-indicator-engine.md`.

```bash
npm install
node speed.mjs        # full-run speed, PineTS vs trading-signals
node parity.mjs       # values, PineTS vs trading-signals (writes bars.csv, engine-values.json)
python -I parity_pandas.py .   # values, PineTS vs pandas-ta (needs pandas, pandas_ta)
node security.mjs     # request.security: which symbol/timeframe reaches the provider
node coverage.mjs     # Pine feature coverage
node stream3.mjs      # live mode, new bar per poll
node forming2.mjs     # live mode, forming bar changed per poll (stock PineTS: ~1 s throttle)
node scan.mjs         # 2,000-symbol scan, 1 vs N worker threads
```

Every-tick tests need the forming-bar throttle removed first:

```bash
sed -i 's/p===0&&f&&d<1e3&&await new Promise(g=>setTimeout(g,1e3-d)),/0,/' node_modules/pinets/dist/pinets.min.es.js
node tick.mjs 50 60          # ticks per second, number of ticks
node tick-trim.mjs 50 300    # same, trimming duplicate points in place
```

TradingView reference values (`tvparity.mjs`, `tvparity_pandas.py`) need `tv-r1.json`, `tv-r2.json` and `tv-r3.json`. They are captured from a signed-in tradingview.com chart (NSE:RELIANCE, 1D) through the page's own `TradingViewApi`:
- add 2 built-in studies at a time with `activeChart().createStudy(...)`: RSI + ATR, then MACD + Bollinger Bands, then EMA(20);
- read the bars and study rows from `activeChart()._chartWidget.model().model().dataSources()` through `data().fullRangeIterator()`.

They are not committed: they are TradingView's data.
