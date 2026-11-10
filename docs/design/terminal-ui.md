# Terminal UI spec

**Subject:** a multi-asset trading terminal (NSE, MCX, US, FX) for an active trader who reads price and acts fast.
**Primary job:** the chart, with the instrument's price and state always visible, and every tool one click from it.
**Conventions:** the layout grammar traders already know from professional charting terminals: a top toolbar, the chart in the middle, a right icon rail with one widget panel, and a bottom panel for trading. Our own palette, type and voice; no other product's branding.

## Tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `ink` (background) | `#0c1016` | `#f3f5f8` | app background, chart background |
| `surface` (panel) | `#121820` | `#ffffff` | toolbars, rails, panels |
| `raised` (muted) | `#1a222c` | `#e9edf2` | hover, selected row, menus |
| `line` (border) | `#222b36` | `#d9dfe7` | 1 px dividers only |
| `text` | `#d3dbe4` | `#17212c` | primary text |
| `quiet` (muted-foreground) | `#7d8b9b` | `#5b6878` | labels, meta |
| `signal` (accent) | `#4f8cff` | `#2459d6` | focus, active tool, selection; never decoration |
| `up` / `down` | `#2bb38a` / `#f0596b` | `#0b7a5b` / `#c42b40` | price direction only |
| `warning` | `#e0b04a` | `#8a6200` | delayed or stale data |

**Type:** IBM Plex Sans for everything, with tabular figures on every number (`.num`).
- Scale: 11 px axis and meta, 12 px tables and controls, 13 px body, 15 px instrument price, 18 px page titles.
- Weights: 400 and 600 only.

**Density:**
- 4 px grid. Rows 28 px. Toolbar 40 px. Icon rail 44 px wide. Controls 28 px tall.
- Radius 4 px on controls, 6 px on popovers. No shadows except popovers and dialogs.

## Layout

```
┌ toolbar 40 ─ logo │ SYMBOL ▾ price chg% ● │ 1m 5m 15m 1h D ▾ │ ƒx Indicators │ … │ theme │ nav ┐
├────────────────────────────────────────────────────────────┬──────────────┬────┤
│ legend (top-left, over chart)                              │ widget panel │ ⋮  │
│ chart                                                      │ 300 px,      │rail│
│                                                            │ resizable    │ 44 │
├──────────────────────── bottom panel (resizable, collapsible) ───────────┤    │
│ Paper trading: account · ticket · positions · orders       │              │    │
└────────────────────────────────────────────────────────────┴──────────────┴────┘
```
- **Rail:** Watchlist, Assistant, Alerts, News, as icons with tooltips. Clicking the active icon collapses the panel.
- **Status:** a dot next to the price (green live, amber delayed, red stale). The text goes in the tooltip, plus a slim banner only when data is stale.
- **Phone:** a toolbar, then the chart, then a bottom tab bar (Chart, Watchlist, Assistant, Trade, Alerts).
- **Text:** left-aligned. **Numbers:** right-aligned in tables.

## Principles

1. **The chart is the hero.** Chrome is quiet surfaces and 1 px lines; colour is reserved for price direction and the signal accent.
2. **Numbers never truncate.** Names truncate, with the full name in a tooltip.
3. **Indicator names live in the legend, not on the price axis.** The axis shows values only.
4. **Nothing overflows** at 1280, 1440, 1920 or 390 px. Every visual change ships with screenshots at those widths.
