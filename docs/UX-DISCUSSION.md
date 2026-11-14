# UX discussion

Status: discussion only. Nothing here is built or decided until the UI/UX map below is agreed. Started 14 Nov 2026; corrected by the owner the same day.

## What we give the user

*A trader opens the app and the assistant has already told them what to watch out for, and why. It keeps watching, and when its conditions are met it acts for them.*

- **The starting point is "What to watch", not a tool.** The first thing a trader sees is the assistant's list of what to watch out for: each item says what might move and why. It draws on markets, news, economic and company events, and price levels. For example: "Crude inventories came in lower; ONGC and Reliance usually follow; watch 1,350 on Reliance." Trading does not keep office hours, so it is never framed as a morning forecast. The on-screen title is simply **What to watch**.
- **One assistant, one personality.** The user did not come to study our internals. They never see "analysts", "a bull and a bear", "watchers", "skills" or "the desk" as separate things. They talk to one assistant, and it explains what it will do in plain words.
- **Paper trading is our test of the AI, not practice for the user.** It is where the assistant trades for real inside our own system, so its decisions and results can be checked before real accounts are ever switched on.

## Principles

1. **Say what will happen, not how it works.**
   - Yes: "If Reliance closes above 1,350, I'll buy 120 shares on paper with a stop at 1,331."
   - Not: "I've created a price watcher with auto-trade enabled and requireBacktest on."
   - Watches, desk runs, skills and backtests stay under the hood. The user sees the promise, the condition and the result.
2. **"What to watch" sets the context.** Later events refer back to it: "Crude moved as flagged; Reliance hit your level; I bought."
3. **Every item carries its reason and how sure the assistant is.** It also keeps an honest record of how past items turned out, so the user can judge it over time.
4. **One assistant everywhere.** Chat, What to watch, alerts and trades all speak in the same voice and show up in one place.

## First step: a UI/UX map before any more UI work

Before any more screens are designed or changed, we write one map that settles three things.

1. **The promise and the moments it serves.** Start from What to watch, then the moments that follow: a condition is met and the assistant acts or asks; the user asks about a symbol; a recap of what was flagged against what happened.
2. **The places and journeys.**
   - Every screen, what it is for, and how a user moves between them.
   - The main journeys, step by step. For example: first visit to a first What to watch; a What to watch item to "watch this for me"; a condition is met, the assistant trades on paper, the user sees the result; asking about a symbol and acting on the answer.
   - Every feature has to sit inside one of these journeys, or it is cut or moved.
3. **One colour theme and visual language,** used the same way on every page, including the public page, the terminal, forms, charts and the assistant. It covers the palette (background, surfaces, text, one brand accent, up and down colours, a warning colour), how the assistant's content is marked, type, spacing and radius, and light and dark modes.

## Points raised so far

1. **The theme is inconsistent.** Blue on some controls and a pink-violet gradient on AI controls compete on the same screen, and neither reads as the brand. We decide one colour family as part of the map.
2. **What to watch does not exist yet as the starting point.** Today the app opens on a dashboard of panels. The pre-market brief is a button you have to press, and its items are not tied to reasons or a track record.
3. **The AI shows up as five products:** chat, AI Desk, watches, the brief and screener scans. These should merge into one assistant. The desk becomes how the assistant thinks before a decision, not a page the user has to understand.
4. **The wording describes internals instead of outcomes.** "Watch", "task", "desk run", "skill" and "requireBacktest" all leak into the interface.
5. **What the assistant has done is scattered** across the bell, the Tasks tab, the journal and the Alerts widget. It needs one record, told in the assistant's voice.
6. **Paper trading is described as practice.** It needs to read as "the assistant is trading on paper so you can see how it does", with its results front and centre.
7. **Two design languages:** the dense terminal versus form pages.

## Open questions

- What does What to watch cover by default: only the user's watchlist and positions, or the wider market too?
- How far does the assistant act on its own on paper today? Should it ask first every time, or act inside limits the user set once?
- What should the recap look like: what was flagged against what happened?

## The assistant behind it (audit, 14 Nov 2026)

What the code does today, against the goal of one assistant that can do anything and learns the user.

- **One harness? Partly.** Chat, the pre-market brief and watch wake-ups run the same assistant with about 42 tools.
  - The trading desk is a separate pipeline. The assistant cannot call it; only the Desk page and watches can.
  - All 42 tool descriptions are sent on every turn, which costs tokens and is one reason setup questions ran out of budget.
- **Skills are not used to their fullest.** The 24 skills were written before the newer data existed.
  - `idea-screen` and `sector-overview` fetch bars symbol by symbol instead of one `scanUniverse` call.
  - No skill uses fundamentals, sentiment, the event scorecard, the order book or web search yet.
  - `earnings-reaction` has no company earnings dates to work from (no free source is wired).
  - There is no options data (option chain, open interest, put/call ratio), which F&O traders in India rely on.
- **Memory is explicit only.** The assistant keeps facts the user tells it (`remember`/`forget`).
  - It does not learn the user's style (short or detailed, cards or prose), markets, timeframes or risk level.
  - It does not learn which answers, cards and tools the user accepts or dismisses.

### Direction for development: one assistant that learns

1. **The desk becomes the assistant's way of thinking.** It is callable as a tool whenever a decision needs the full analysis, and its result comes back as the same trade card.
2. **Tools load by need.** A small core is always on; groups (screening, events, news, execution, chart) are loaded when the conversation needs them, so each turn stays light.
3. **Skills are refreshed** to use every data tool we now have. Each skill states the data it needs and says plainly when that data is missing.
4. **A user profile the assistant builds and the user can see and edit:**
   - markets and instruments, timeframes, risk per trade, how much it may do on its own;
   - response style (length, cards or text, language).
   - It is learned from conversations and from behaviour (cards applied or dismissed, answers marked useful or not) and read at the start of every turn.
5. **Plain promises in every reply and screen:** "If X happens, I will do Y", never the mechanism.
6. **Data gaps to close:** options chain and open interest from Kite; a company earnings calendar.

## Flow: how the assistant runs on its own (proposal, under discussion)

Owner decision, 14 Nov 2026: on paper the assistant trades by itself for now; this sits behind a flag so it can be switched to "ask first" later. What follows is the proposed flow, not yet agreed.

### When nothing is set up (empty)

- **Decided (owner, 14 Nov):** there is **no separate paper book**. The assistant trades only through tasks the user can see.
- **Proposed:** with no tasks, it does not trade. It still writes What to watch and offers each item as "Want me to follow this?"; accepting an item creates a task.

### When it starts

- A followed item becomes active when the user accepts it.
- It acts only while that instrument's market is open: NSE 09:15 to 15:30 IST; MCX into the evening; forex Monday to Friday around the clock; crypto always.
- It never acts on stale prices. If the feed is down or Zerodha is disconnected, it waits and says so.

### What a day looks like (Indian equities as the example)

1. **Before the open:** What to watch is ready, including items carried over from yesterday that are still being followed.
2. **At the open:** followed items are live.
3. **When a condition is met:** it places the paper trade inside the limits, then tells the user in plain words what it did and why, with one tap to close it.
4. **During the trade:** the stop and target are set at entry and never widened. It reports only when something changes.
5. **At the close:** intraday positions are closed before the market shuts (15:15 IST for NSE intraday). Positional trades stay open with their stop.
6. **After the close:** a recap of what was flagged, what it did, and how it went, which feeds the track record.

### When it stops

- **For one trade:** the stop or target is hit; the user closes it; the reason no longer holds (it says why).
- **For the day:**
  - the daily loss limit is hit;
  - the trades-per-day limit is reached;
  - the market closes;
  - the data goes stale or the broker disconnects (it waits, and resumes when data is back).
- **Until the user says so:** the user pauses it, or an admin uses the kill switch. Everything stays visible; nothing new is entered.
- **Proposed, open:** around a high-impact release (for example the RBI decision), it does not enter new trades from 15 minutes before to 15 minutes after, unless the followed item is about that release.

### When it starts again

- The next trading session for that market, or when the user resumes.
- After a daily-limit stop it starts fresh the next day and says so in What to watch.

### Open questions

1. ~~Should the assistant run its own paper book?~~ Decided: no.
2. Do followed items expire? For example at the end of the day, after N days, or when the reason no longer holds.
3. Should it carry positional (multi-day) trades, or only intraday for now?
4. Is the no-new-trades window around high-impact releases right, and how long should it be?

## Decisions and notes (owner, 14 Nov 2026)

1. **Everything the assistant does is a task, and every task is visible.**
   - Anything it watches, follows or will act on is a task: a symbol it is watching, a price or event it is waiting for, an auto-trade, a scheduled check, a desk run.
   - **A Tasks tab** lists them all, with what each one is watching, its state (watching, running now, paused, done, failed), when it last ran, and what it did.
   - The user can **stop, pause, resume and delete** any task from that tab.
   - A task that is **running right now** is shown as running, wherever the user is in the app.
   - The tab is called **Tasks** (decided). Each task has a plain title, written for the customer, that says what it is doing right now. For example:
     - "Watching RELIANCE: will buy above 1,350"
     - "Gathering news for INR"
     - "Waiting for the RBI decision at 10:00"
     - "Running the AI Desk on NIFTY"
     - "In a trade: RELIANCE, stop 1,331, target 1,368"
   - The title changes as the task moves on (watching, then in a trade, then done), so the list always reads as what the assistant is doing.
   - Not "Promises", not "watchers". On-screen names stay words a trader knows: Tasks, Alerts, Positions, Orders, Watchlist.
2. **AI Desk history is missing.**
   - The user cannot find previous desk runs: there is no history to browse.
   - Today's page only lists past runs for the symbol currently typed in. Runs on other symbols, and runs started by watches, are not findable.
   - Needed: a history of every desk run (any symbol, started by the user or by a task), with its decision, time and outcome, openable from the Tasks tab and from the symbol.
3. **The skill name shows under answers** (decided): "Using: Day trader", so the user can see which playbook shaped the answer.

## UX map, draft v0 (for discussion)

### Places

| Place | What it is for | Status today |
|---|---|---|
| Public site | What the product does, sign in | Built |
| **What to watch** (home after sign-in) | The assistant's list of what to watch out for and why; each item can be followed with one tap, which creates a task | Missing: today Home is a dashboard with a brief button |
| **Symbol workspace** (the Terminal) | Chart, order book, options*, news, fundamentals, alerts, trade panel, and the assistant beside it, all for one instrument | Built, but desk results, screener hits and backtests do not open into it |
| **Assistant** (docked on every page) | One assistant with three tabs: Chat, **Tasks**, About you | Chat and About you built*; Tasks is inside the chat panel only |
| **Tasks** | Everything the assistant is doing, with plain titles ("Watching RELIANCE: will buy above 1,350"), state, last run, and stop, pause, resume, delete; desk runs included | Partly built: alerts and watches listed, desk runs and auto-trades not in one list, no global "running now" view |
| **Portfolio** | Paper account: positions, orders, the journal of what the assistant did and why, its performance and track record | Missing as a page: positions and journal live in the terminal's trading panel; no track record |
| Screener | Scan a market; results open the symbol | Built |
| Strategies | Test rules on history; a passing rule can become a task | Built; cannot yet become a task |
| AI Desk | The assistant's full analysis for one decision, with history of every run | Built; history missing (only the typed symbol) |
| **Settings** | Profile, how much the assistant may do on its own (the flag), limits, email, theme | Missing: settings are split between About you*, the bell panel and per-task switches |
| Admin | Broker connection, data sources, jobs, prompts | Built |

\* waiting to be merged (AG-11, AG-12) or being built (AG-13: options, earnings).

### Journeys

1. **First visit:** public site, then sign in, then pick markets and style (short setup), then the first What to watch, then follow an item, which creates a task.
2. **A day with tasks:** What to watch; a condition is met; the assistant trades on paper inside the limits; a notification says what and why, with Close it; the task title updates; the recap after the close; the track record.
3. **Ask about a symbol:** ask the assistant; get an answer or a trade card; draw it, set an alert, follow it as a task, or place it.
4. **Find ideas:** run a screen; open a result in the symbol workspace; ask the desk; follow it as a task.
5. **Test an idea:** backtest a rule; save it; turn it into a task.
6. **Review:** Portfolio and track record: what was flagged, what was done, how it went.

### Not accounted for yet

- **What to watch** as the home, with follow-to-task, and its **track record**.
- **One global Tasks view** that includes alerts, watches, auto-trades, desk runs and screens, with "running now" visible from anywhere.
- **Desk history** across all symbols and runs started by tasks.
- **Portfolio page** with the assistant's performance; the trade journal is hidden in the terminal.
- **Settings page:** the autonomy flag (paper: acts by itself; ask first), limits (risk per trade, trades per day, daily loss), email, profile, theme.
- **The recap** after the close.
- **First-run setup** (markets, style) that seeds the profile.
- **Notifications vs Tasks vs journal:** three places say what happened; decide one home and how the others link to it.
- **Strategies and screens becoming tasks.**
- **Pause everything / kill switch** for the user (and for admin).
- **One colour theme** and visual language across the public site and the app.
- **Phone layouts** for the new places.

## What the assistant can do (as of AG-12; AG-13 in progress)

- **See the market:**
  - quotes, bars and indicators (built-in and Pine);
  - order book;
  - market hours and holidays;
  - instrument search and universes (NIFTY 50/100/500, forex, commodities, US, crypto);
  - screener scans;
  - fundamentals for NSE stocks;
  - options chain and open interest (coming in AG-13).
- **Read the world:**
  - news grouped into stories, with sentiment and crowd chatter;
  - the economic calendar with what each event means, actual values (US needs the FRED key) and how markets reacted before;
  - web search;
  - company earnings dates (coming in AG-13).
- **Think:**
  - 42 playbooks (skills), with the skill name shown;
  - a calculator;
  - the AI Desk for a full decision (analysts, both sides, trader, risk check);
  - rule backtests on history.
- **Act (paper):**
  - trade cards and paper orders (place, cancel, close) behind the risk check;
  - auto-trade inside limits;
  - watchlist changes and alerts;
  - chart actions (add, remove or change indicators, draw levels, add Pine scripts);
  - saving strategies.
- **Keep watching (tasks):** schedules; prices and indicators; news; economic events (with surprise filters and pre-event briefs); sharp moves; screen matches; running the desk on a trigger. It decides whether a wake-up is worth reporting.
- **Remember:**
  - notes you ask it to keep;
  - a profile of your markets, style and risk;
  - what has worked for you, learned from thumbs up/down and the cards you apply or dismiss.
- **Report:** in-app notifications and email (to an address you give).
- **Stays inside:** daily limits on turns, wake-ups and desk runs, and token budgets.

## Decisions (owner, 14 Nov 2026, second round)

1. **The assistant gets its own main window, agent first (like a code editor where the agent is the main thing).**
   - The chat is the centre of the product: how the assistant replies is what the product does.
   - Tasks are shown in that window, beside the conversation, with running ones visible.
   - Charts, scans, trade plans and portfolio views appear inside the conversation as interactive pieces, and can be opened full size.
2. **The AI Desk page goes away.**
   - The desk becomes something the assistant runs by itself when a decision needs it, like a skill.
   - Every run is saved automatically to history with its full trace (what each role said, the data it saw).
   - The result shows in the chat as an interactive card.
3. **A Portfolio page** shows what the AI has done and what the user has done, side by side: positions, orders, results and the reasons behind each trade.
4. **A Settings page** holds the profile, the autonomy flag and limits, email and theme in one place, designed so the user never hunts for a setting.
5. **Interactive chat is the core experience.**
   - Replies are made of working pieces (cards, tables, charts, buttons) that do things: place, follow, alert, draw, open.
   - The assistant can build the UI a reply needs, not only text.
6. **The assistant gives predictions, trades and suggestions directly.** No holding back, and no refusing to give a view.

### How "the assistant builds the UI" stays safe (proposal)

The owner wants it free, since it is all our data. Technical position:

- **Free to build:** the assistant composes replies from a library of our components (trade card, price ladder, chart, table, comparison, checklist, buttons). It can build any layout from them, and every piece reads our data freely.
- **Buttons only do things through our actions** (place a paper order, follow as a task, set an alert, draw, open a symbol), with the same checks as everywhere else. A headline or a web page the assistant read can never make a button do something else.
- **For anything the library cannot show,** the assistant can write a custom view that runs in a sandbox. It gets our data passed in, but no login session and no direct way to place orders, so a bad or tricked piece of code cannot act for the user.

### What "no holding back" keeps (proposal)

- Every prediction and suggestion still states **its reason and how sure it is**, and feeds the **track record**. That does not hold back the view; it is what makes it useful.
- Trades still go through the **risk check and the user's limits**. The view is free; position size is not.

## UX map changes from this round

- **Assistant window** becomes the main place: Chat in the centre, Tasks beside it, interactive replies.
- **AI Desk** is removed as a place. Its runs live in the assistant's history and in Tasks.
- **Portfolio** (AI vs user) and **Settings** are confirmed as places.
- What stays: What to watch (home), the Symbol workspace, Screener, Strategies (both reachable from the assistant and opening their results in the chat or the symbol), and Admin.

## Decisions (owner, 14 Nov 2026, third round)

1. **Two modes of one app, switched with a button.**
   - From the Terminal, **Switch to agent** opens the agent window.
   - From the agent window, **Back to terminal** returns.
   - Nothing is lost when switching: the symbol, the conversation and the tasks carry over.
2. **What to watch is global for the user.**
   - The assistant keeps it for that user and knows it, so it can answer "what should I watch?" from it in chat.
   - It is shown on the Home page.
3. **In the agent window the chart is not the focus.**
   - The stocks in focus are shown as **numbers**: price and move, their fundamentals, and the figures the assistant is using.
   - Charts stay in the Terminal; the assistant can still show a small chart inside a reply when it explains something.

### The numbers shown for a stock in focus (confirmed)

- **Price:** last price, change today, day range, volume against its usual volume, where it sits in its 52-week range.
- **Fundamentals (NSE):** P/E, ROE, debt to equity, sales and profit growth, promoter holding.
- **Mood:** news sentiment today and this week, the number of sources, crowd chatter.
- **Coming up:** the next event or results date that can move it.
- **Yours:** open position and P&L, and the tasks on it with their plain titles.
- **The assistant's view:** its current call (buy, sell, hold or watch), how sure it is, and its levels.

## Decisions (owner, 14 Nov 2026, fourth round)

1. **The focus numbers above are confirmed.** They get cluttered beyond about three stocks, so the layout has to stay readable as the list grows:
   - one stock is open in full at a time;
   - the others are one compact row each (name, price, move, the assistant's call, a task badge) that opens in full on click.
2. **Density: in between, not compressed.**
   - The current UI squeezes too much (13px base, tight rows, small buttons).
   - The whole app must look like one product, with the same structure and sizes everywhere: type scale, spacing, row heights, button sizes, panels and headers.
3. **Reference: TradingView.**
   - Its pages outside the chart look good.
   - Its terminal shows a lot of information with clear, consistent buttons and controls, and still feels cohesive.
   - That is the bar for density, structure, sizing and controls across the Terminal, the agent window and every other page.
