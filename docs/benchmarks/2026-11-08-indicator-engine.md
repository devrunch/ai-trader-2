# Indicator engine benchmark — 2026-11-08

**Question:** can PineTS be the one indicator engine (SRD §7.10, call C8), or do we need something else?

**Setup:**
- **Laptop:** Intel i5-11300H (4 cores, 8 threads), 16 GB, Windows 11, Node 22.14.
- **Libraries:** PineTS 0.13.1 (latest, 27 Oct 2026; production runs 0.9.31), trading-signals 8.3.0, pandas-ta 0.4.71b0.
- **Data:** deterministic synthetic 1-minute bars (seeded random walk), so every engine gets identical input.
- **Scripts:** `spikes/indicator-bench/` (`npm install`, then `node <file>.mjs`).
- **AWS caveat:** expect Fargate vCPUs to be somewhat slower than this laptop; treat these as best-case numbers.

## Results

### 1. Speed of one full run (median)

| Workload | 500 bars | 5,000 bars | 20,000 bars |
|---|---|---|---|
| PineTS, RSI(14) | 11.6 ms | 25.0 ms | 101.7 ms |
| PineTS, 6 indicators (RSI, EMA, MACD, BB, Supertrend, ATR) | 28.3 ms | 105.2 ms | 457.4 ms |
| trading-signals, RSI(14) | 1.7 ms | 0.8 ms | 3.5 ms |
| trading-signals, RSI + EMA | 1.0 ms | 1.0 ms | 3.9 ms |

PineTS is about **25 to 100 times slower** than native TypeScript for a full computation.

### 2. Live updates (new bar arriving)

| Path | Cost per update |
|---|---|
| PineTS `run()` again on the same instance (5,000 bars, 6 indicators) | 126.8 ms (full re-run, nothing is reused) |
| PineTS `stream({ live: true, pageSize })` (5,000 bars, 6 indicators) | **0.78 ms median**, 3.7 ms max |
| trading-signals `replace()` on the forming bar (RSI) | 1.35 µs |

PineTS's live stream does compute incrementally. `run()` does not, so the engine must use `stream()` for charts and live alerts.

**Forming bar (same bar, new tick), measured in `forming2.mjs`:**
- **Values are correct.** After each tick, all 6 indicators equal a fresh full run exactly (difference 0). PineTS rolls back its internal state and re-runs only the last bar.
- **Updates are throttled to about 1 per second, by design.** The stream loop waits until 1,000 ms have passed when only the last candle changed (`d < 1e3 && setTimeout(1e3 - d)`). Measured: 1,013 ms per forming-bar update. There's no option to change it.
- **Plot output keeps a duplicate point per tick.** It holds several entries with the same time (5,007 points for 5,000 bars after 7 ticks). The consumer must keep only the last value per bar time, and the series grows through the session unless it is trimmed.
- An earlier run showed values drifting. That was a race in the test (the comparison used a later tick), not a PineTS bug.

**Every tick (owner requirement), measured in `tick.mjs` and `tick-trim.mjs`.** Setup:
- the 1-second throttle removed with a one-line patch;
- a provider that answers as soon as a tick is pushed, instead of being polled;
- `interval: 0`;
- 6 indicators on 5,000 bars.

| Ticks per second | Ticks | Updates computed | Latency p50 | p95 | Max | Values vs fresh full run |
|---|---|---|---|---|---|---|
| 10 | 60 | 60 | 2.48 ms | 5.99 ms | 31.0 ms | identical |
| 50 | 60 | 60 | 2.64 ms | 6.34 ms | 9.7 ms | identical |
| 50, with duplicates trimmed in place | 300 | 299 (one tick coalesced) | 2.00 ms | 3.74 ms | 45.0 ms | identical; series stays at 5,000 points |

What this shows:
- **Every-tick Pine is feasible**, at about 2–3 ms per tick per script of 6 indicators.
- **Trimming in place is safe.** Each `plots[*].data` array is trimmed in the `data` handler to one point per bar time; PineTS keeps working and the series stops growing.
- **Coalescing is correct.** When ticks arrive faster than computation, the newest tick wins, so a coalesced tick never leaves a wrong value.

**Pitfall:** without `pageSize`, the stream emitted about 450,000 events from one poll, so `pageSize` must always be set.

### 3. Scan: 2,000 symbols × 500 bars

| Engine | 1 worker | 8 workers |
|---|---|---|
| PineTS, 6 indicators | 29.1 s | 13.2 s |
| PineTS, RSI only | 8.3 s | 4.7 s |
| trading-signals, RSI + EMA + ATR | **0.8 s** | 1.1 s (worker start-up costs more than it saves) |

PineTS can't power frequent full-universe scans or alerts on hundreds of instruments. Native TypeScript can.

### 4. Do the values match? (2,000 bars)

| Indicator | PineTS vs trading-signals | PineTS vs pandas-ta (today's Python engine) |
|---|---|---|
| RSI(14) | match (≤ 5e-11) | **14.0 points apart during warm-up**, match after ~300 bars |
| EMA(20) | 0.26 apart during warm-up (different seed), match after | match |
| ATR(14) | match | match |
| MACD | — | match |
| Bollinger upper (20, 2) | — | **0.23 apart on every bar** (different standard-deviation formula) |
| Supertrend (3, 10) | — | **up to 18.5 apart, still 1.47 after warm-up** |

**This proves the two-engine problem in production today.** The Python engine behind the agent and backtests gives different Bollinger and Supertrend values from the Pine engine behind the chart, on every bar. Native TypeScript libraries also need warm-up seeding aligned to TradingView's, which a parity test per indicator will enforce.

### 4b. Against TradingView itself (real data)

Reference values were read from tradingview.com, from a signed-in chart of NSE:RELIANCE on the daily interval: 886 bars from 13 Apr 2023 to 6 Nov 2026, using TradingView's built-in RSI(14), ATR(14, RMA), MACD(12, 26, 9), Bollinger Bands(20, 2) and EMA(20). Both engines were then run on exactly those bars.
- **Comparison window:** from bar 300 onward, because TradingView computed from 2020 history while our input starts in 2023, and RSI, ATR, EMA and MACD depend on all earlier bars. Bollinger has no such dependence, so it was also compared on all bars.
- **Not covered:** Supertrend. The plan's built-in wasn't reachable through the page API; a community script loaded instead and was discarded.

| Indicator | PineTS vs TradingView | trading-signals vs TradingView | pandas-ta vs TradingView |
|---|---|---|---|
| RSI(14) | 8.9e-10 | 8.9e-10 | 3.0e-9 |
| ATR(14) | 6.3e-10 | 5.8e-10 | 5.8e-10 |
| MACD line | 1.1e-9 | 1.8e-9 | 1.0e-9 |
| MACD signal | 1.5e-9 | 2.6e-9 | — |
| MACD histogram | 4.5e-10 | 8.4e-10 | — |
| BB basis | 2.3e-12 | 2.1e-12 | — |
| BB upper | 3.5e-10 (6.4e-10 on all bars) | 3.0e-10 (5.9e-10 on all bars) | **4.5 rupees** |
| BB lower | 3.6e-10 | 3.1e-10 | — |
| EMA(20) | 5.0e-11 | 1.6e-12 | 3.0e-12 |

(Maximum absolute difference over 586 bars; 867 bars for the "all bars" figures.)

- **[Certain] PineTS and trading-signals both reproduce TradingView** to floating-point noise on real NSE data.
- **[Certain] pandas-ta's Bollinger band is off by up to ₹4.5** on RELIANCE. It uses a different standard-deviation formula. Today's agent and backtests use it.

### 5. `request.security` (multi-timeframe and other symbols)

- In 0.13.1 it **works**. The provider is called for the other symbol and for the higher timeframe. The higher-timeframe value changed 200 times over 3,000 one-minute bars, exactly once per 15-minute close, so there is no lookahead.
- **Gap found:** PineTS **strips the exchange prefix** before calling the provider. `NSE:NIFTY` arrives as `NIFTY`, and `syminfo.tickerid` (`NSE:RELIANCE`) arrives as `RELIANCE`. With canonical IDs, `NSE:RELIANCE` and `BSE:RELIANCE` become indistinguishable. Needs a fix: a prefix-preserving hook, an upstream patch, or resolving through the chart's exchange. Removing the strip at the one call site in `pinets.min.es.js` that matches `c.includes(":")?c.split(":")[1]:c` did **not** change what the provider receives, so there is at least one more strip point; the patch needs a proper look at the source, not the minified build.

### 6. Pine feature coverage (20 feature scripts, v6 unless noted)

**18 of 20 ran:**
- plot, hline, fill, bgcolor, plotshape, plotchar, barcolor, plotcandle;
- all 12 `input.*` types;
- var and varip;
- if, for, while, switch, for…in;
- arrays, maps, matrices;
- user-defined types with methods;
- functions returning tuples;
- label, line, box, table, polyline, linefill;
- pivots, Supertrend, VWAP, DMI;
- alertcondition and alert;
- `strategy.*`;
- timeframe, session and time built-ins;
- `request.security_lower_tf`;
- v5 scripts.

**Failed:**
- `import TradingView/ta/7` (libraries): needs an import resolver, which we would have to supply (PineTS 0.13 supports resolvers).
- v4 scripts: "Only version 5 and above are supported."

This tested whether each feature *runs*, not whether its output matches TradingView bar for bar. Output parity needs a corpus of real scripts with TradingView reference output.

## Licence — the decision this forces

- **PineTS is `AGPL-3.0-only`,** checked in the package files, and so is 0.9.31, which runs in production today.
- Its README says the copyleft applies when the software is provided as a network service.
- A commercial licence is available from LuxAlgo, with no public price.
- **[Likely] Running PineTS inside a SaaS without that licence obliges us to publish the source of the service that uses it.** That applies to the current product as well as to AI Trader 2. This is not legal advice; confirm with LuxAlgo and a lawyer.

## Alternatives checked

| Option | What it is | Verdict |
|---|---|---|
| **PineTS** (LuxAlgo) | TypeScript Pine v5/v6 runtime with streaming and `request.security`. 934 stars, about 10 releases between 25 Sep and 27 Oct 2026. AGPL or commercial. | Only mature option for running pasted Pine in Node. |
| PyneCore (PyneSys) | Python runtime. Pine source must be converted by a paid PyneSys API ($8–48/month, daily caps, script size limits). Apache-2.0. Claims 99.77% bit-exact against TradingView. Not designed for streaming. | No: Python, sends user scripts to a third party, no live mode. |
| resin, pinescript-compiler, Pine-A-Script, pinescript-langium | Small TypeScript/JavaScript Pine projects with 1–12 stars. | Too immature. |
| TradingView Charting Library | Charts with custom indicators in JavaScript (PineJS API), not Pine source. Commercial licence. | Doesn't run Pine. |
| **trading-signals** 8.3.0 | TypeScript, MIT. About 100 indicators (RSI, MACD, Supertrend, Ichimoku, VWAP, ZigZag, PSAR…), streaming `add`/`replace`. | Best fit for native built-ins (fast path). |
| indicatorts 2.2.2 | TypeScript, MIT, array-based. | A backup for the native set. |
| technicalindicators 3.1.0 | MIT, last published July 2023. | Stale. |
| tulind 0.8.20 / talib-web 0.1.3 | LGPL C bindings / a BSD WASM port, last published 2022. | Stale; native build pain. |

## Conclusion

1. **Two-tier engine, one set of numbers.**
   - **Built-ins** run on native TypeScript (trading-signals, wrapped so warm-up and formulas match TradingView), everywhere: chart, agent, scans, alerts, backtests.
   - **User, imported and agent-written Pine** runs on PineTS, using `stream()` for live updates.
   - A parity test checks each native built-in against PineTS output, which follows TradingView semantics.
2. **Buy the PineTS commercial licence** before AI Trader 2 ships, or before then for the current product. The other option is to make the product AGPL-licensed open source. There is no mature non-AGPL Pine runtime.
3. **Fix the exchange-prefix stripping** in `request.security` before canonical IDs depend on it.
4. **Retire pandas-ta** as an engine. Its Bollinger and Supertrend values don't match the chart.
