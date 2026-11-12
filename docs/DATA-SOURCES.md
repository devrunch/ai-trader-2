# Data sources

Owner direction 2026-11-12: every external data source enters the app through one structure. No ad-hoc fetches in tools, jobs or controllers. This document is the contract AG-7 to AG-10 build against; a source not listed here is not added without updating this file first.

## Rules

1. **A domain module owns each kind of data.** Sources live inside the owning module, never in `agent`, `screener` or a controller.

   | Data | Owner module |
   |---|---|
   | Prices, bars, quotes, order book (depth) | `market-data` |
   | Instrument lists, universes (NIFTY 50/100/500 and others) | `instruments` |
   | Headlines, clusters, sentiment, crowd chatter | `news` |
   | Calendar, event specs, actuals, surprise, scorecard | `calendar` |
   | Company fundamentals (ratios, results, shareholding) | `fundamentals` (new) |
   | Web search | `research` (new) |
   | Scans | `screener` (new): reads other modules' application APIs only, has no sources of its own |

2. **One adapter per source.** File: `modules/<owner>/infrastructure/sources/<source-id>.source.ts`. It implements the owning module's port (for example `NewsSource`, `EventSource`, `ActualsSource`, `FundamentalsSource`, `DepthFeed`) and does three things only: fetch, parse, and map to the module's contract types. Business rules stay in the application layer.

3. **Shared plumbing in `shared/sources/`:**
   - `SourceDescriptor`: `id`, `owner`, `kind`, `markets[]`, `envKeys[]`, `rateLimit` (requests per window), `schedule` (cron or on-demand), `terms` (one line: which endpoint and why it is allowed), `docs` (URL).
   - `SourceRegistry`: the single list of descriptors. A source is enabled only when all of its `envKeys` are set. A missing key means the source is off, reported "off (no key)", and never a crash.
   - `SourceClient`: the only HTTP path for adapters.
     - Timeout, response size cap and an identifying User-Agent.
     - A per-source token bucket in Redis, shared by the api and market-data processes.
     - Retry with backoff on 429/5xx; no retry on 4xx.
   - `SourceHealth`: every call records last success, last error, items and latency, per source.

4. **Admin "Data sources" view:** the registry joined with health: enabled or off, last success, last error, items in 24h, rate-limit hits. This is where a broken feed shows, not in logs.

5. **Provenance on every record:** `source` and `fetchedAt` columns, plus a dedupe key. Agent tool outputs carry `source` so answers can cite it.

6. **The time machine applies to all stored data.** Every store query takes `asOf` and returns nothing dated after it. This covers bars, depth snapshots, news, sentiment, events, actuals and fundamentals by report date. One leak test per store.

7. **The agent reaches data only through module application APIs**, exposed as tools (catalog below). A tool never names a source and never calls an adapter.

8. **Config:** each key is optional in `app-config.ts` (blank means off), is listed in `.env.example` with one line, and is passed through the `x-app-env` list in `docker-compose.coolify.yml`.

9. **Tests per adapter:**
   - A parse test on a recorded fixture (`__fixtures__/<source-id>/`).
   - The shared conformance spec (like `instruments/.../sources.conformance.spec.ts`).
   - A "shape changed" test: a parse that finds nothing is an error, never an empty success.

## Source catalog

Status: **live** = in production; **build** = AG task; **key** = waiting for a key; **lost** = no longer available.

| id | Owner | Kind | Markets | Key | Limit | Status |
|---|---|---|---|---|---|---|
| kite | market-data, instruments | ticks, bars, 5-level depth, instruments | India (NSE/BSE/NFO/MCX) | ZERODHA_* | historical 3/s | live (depth: build AG-7) |
| deriv | market-data, instruments | ticks, bars, bid/ask | forex, crypto, commodities | none | WS | live (bid/ask: build AG-7) |
| yahoo-delayed | market-data | quotes/bars about 15 min delayed | US | none | polite | live |
| nasdaq-trader | instruments | symbol directory | US | none | daily | live |
| nse-indices | instruments | NIFTY 50/100/500 constituents (NSE index CSVs) | India | none | daily | build AG-7 |
| twelve-data | market-data, calendar | quotes where feeds lack them; US earnings dates | US, forex, commodities | TWELVE_DATA_API_KEY | 8/min | build AG-8 |
| rss-* (ET, Mint, BS, CNBC-TV18, BusinessLine, Investing, Yahoo index) | news | headlines | India, global | none | 5 min | live |
| yahoo-ticker-rss | news | per-ticker headlines | US, watched symbols | none | 5 min | build AG-9 |
| newsapi | news | global macro headlines | global | NEWS_API_KEY | 100/day | live |
| newsdata | news | headlines by market | global, India | NEWSDATA_API_KEY | 200/day | build AG-9 |
| alphavantage-news | news | headlines + vendor sentiment | US, forex, crypto | ALPHAVANTAGE_API_KEY | 25/day | build AG-9 |
| forex/crypto/commodity RSS | news | market-specific headlines | forex, crypto, commodities | none | 5 min | build AG-9 (terms checked per feed) |
| reddit | news | crowd chatter (labelled crowd) | India, forex, US, crypto | none | 60/min | build AG-9 |
| llm-sentiment | news | sentiment scoring (cheap model) | all | AGENT_MODEL / DESK_MODEL | NEWS_LLM_DAILY | build AG-9 |
| finbert | news | sentiment fallback | all | HF_API_TOKEN, FINBERT_MODEL | HF free tier | build AG-9 |
| ff-weekly | calendar | schedule, forecast, previous (no actual) | global FX | none | 3 h | live |
| ff-event-specs | calendar | what each event measures, beat direction (29 inverted), notes | global FX | none (vendored JSON, 693 events) | static | build AG-8 |
| rbi, mospi | calendar | India policy and data release dates; actuals from press releases | India | none | daily | live (dates); actuals + auto-discovered MoSPI calendar: build AG-8 |
| fred | calendar | US actuals + full history (curated series) | US, so USD, gold | FRED_API_KEY | 120/min | key |
| nse-corporate | calendar | results / board meetings for the NIFTY 500 | India | none | polite | build AG-8 (skip if not stably reachable) |
| eia | calendar | crude inventory schedule + actuals | commodities | none | weekly | build AG-8 |
| screener-in | fundamentals | ratios, results, growth, shareholding | India | none | <= 1 request / 3 s; `/company/<SYMBOL>/` only (robots.txt) | build AG-7 |
| tavily | research | web search for the agent | all | TAVILY_API_KEY | AGENT_WEB_SEARCH_DAILY | build AG-9 |
| ff-history | calendar | actuals history from 2007 (old product's 66 MB export) | global FX | none | static | lost: rebuild from FRED history + our own captured actuals |

## Agent tool catalog (the only door to data)

| Tool | Module API | Notes |
|---|---|---|
| getQuote, getBars, getIndicator | market-data, indicators | all markets; `asOf` |
| getDepth | market-data | 5 levels for NSE/BSE; top of book for Deriv |
| getMarketStatus | market-data | sessions, holidays, next open/close |
| searchInstruments, listUniverse | instruments | |
| scanUniverse, watchScreen | screener | price + fundamental conditions |
| getNews, getSentiment, getCrowd | news | clusters, source count, `asOf` |
| getEconomicCalendar, getEventScorecard | calendar | specs, actuals, surprise, reaction history |
| getFundamentals | fundamentals | NSE stocks |
| webSearch | research | capped, cited |
| runBacktest, saveStrategy | strategies, compute | |
| watchNews, watchEvent, watchMove, watchScreen | agent tasks | queued runs (AG-6) |

## Order of work

1. **AG-7:** first the `shared/sources` plumbing and the admin view, then move existing live sources (RSS, newsapi, ff-weekly, rbi/mospi) onto it with no behaviour change. Then depth, fundamentals and the screener.
2. **AG-8:** calendar sources (specs, actuals, FRED, MoSPI auto-discovery, NSE corporate, EIA, Twelve Data earnings), then the scorecard and watchers.
3. **AG-9:** news sources, clustering, sentiment, crowd, web search, email delivery.
4. **AG-10:** the tool audit against the catalog above, skills for all markets, and `getMarketStatus`.
