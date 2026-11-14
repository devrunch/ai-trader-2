# UX discussion

Status: discussion only. Nothing here is built or decided until the UI/UX map below is agreed. Started 14 Nov 2026; corrected by the owner the same day.

## What we give the user

*A trader opens the app in the morning, and an assistant has already told them what to watch today and why. It keeps watching through the day, and when its conditions are met it acts for them.*

- **The starting point is the morning, not a tool.** The first thing a trader sees is a note from the assistant: what to watch today, and what it expects to happen and why. It draws on overnight markets, news, today's economic and company events, and price levels. For example: "Crude may push higher today after the inventory draw; ONGC and Reliance usually follow; watch 1,350 on Reliance."
- **One assistant, one personality.** The user did not come to study our internals. They never see "analysts", "a bull and a bear", "watchers", "skills" or "the desk" as separate things. They talk to one assistant, and it explains what it will do in plain words.
- **Paper trading is our test of the AI, not practice for the user.** It is where the assistant trades for real inside our own system, so its decisions and results can be checked before real accounts are ever switched on.

## Principles

1. **Say what will happen, not how it works.**
   - Yes: "If Reliance closes above 1,350, I'll buy 120 shares on paper with a stop at 1,331."
   - Not: "I've created a price watcher with auto-trade enabled and requireBacktest on."
   - Watches, desk runs, skills and backtests stay under the hood. The user sees the promise, the condition and the result.
2. **The morning note sets the day.** Everything later in the day refers back to it: "As expected this morning, crude moved; Reliance hit your level; I bought."
3. **Every forecast carries its reason and how sure the assistant is.** It also keeps an honest record of how past morning calls turned out, so the user can judge it over time.
4. **One assistant everywhere.** Chat, the morning note, alerts and trades all speak in the same voice and show up in one place.

## First step: a UI/UX map before any more UI work

Before any more screens are designed or changed, we write one map that settles three things.

1. **The promise and the daily moments it serves.** Start from the morning note, then the moments that follow: a condition is met and the assistant acts or asks; the user asks about a symbol; the end-of-day recap.
2. **The places and journeys.**
   - Every screen, what it is for, and how a user moves between them.
   - The main journeys, step by step. For example: first visit to first morning note; morning note to "watch this for me"; a condition is met, the assistant trades on paper, the user sees the result; asking about a symbol and acting on the answer.
   - Every feature has to sit inside one of these journeys, or it is cut or moved.
3. **One colour theme and visual language,** used the same way on every page, including the public page, the terminal, forms, charts and the assistant. It covers the palette (background, surfaces, text, one brand accent, up and down colours, a warning colour), how the assistant's content is marked, type, spacing and radius, and light and dark modes.

## Points raised so far

1. **The theme is inconsistent.** Blue on some controls and a pink-violet gradient on AI controls compete on the same screen, and neither reads as the brand. We decide one colour family as part of the map.
2. **The morning note does not exist yet as the starting point.** Today the app opens on a dashboard of panels. The pre-market brief is a button you have to press, and it does not make forecasts with reasons.
3. **The AI shows up as five products:** chat, AI Desk, watches, the brief and screener scans. These should merge into one assistant. The desk becomes how the assistant thinks before a decision, not a page the user has to understand.
4. **The wording describes internals instead of outcomes.** "Watch", "task", "desk run", "skill" and "requireBacktest" all leak into the interface.
5. **What the assistant has done is scattered** across the bell, the Tasks tab, the journal and the Alerts widget. It needs one record, told in the assistant's voice.
6. **Paper trading is described as practice.** It needs to read as "the assistant is trading on paper so you can see how it does", with its results front and centre.
7. **Two design languages:** the dense terminal versus form pages.

## Open questions

- What does the morning note cover by default: only the user's watchlist and positions, or the wider market too?
- How far does the assistant act on its own on paper today? Should it ask first every time, or act inside limits the user set once?
- What should the end of the day look like: a recap of what was predicted against what happened?
