import { ChatViewSchema, CustomViewSchema } from '@aitrader/contracts';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

/**
 * The assistant builds the UI a reply needs. `showView` composes our blocks (figures, tables, comparisons, small charts, callouts, buttons);
 * `showCustomView` is for anything the blocks cannot show and runs sandboxed in the browser. Both only echo a checked spec: the web app draws it.
 */
export function buildViewTools(deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'showView',
      description: 'Show part of your answer as interactive UI instead of a wall of text: headings, short markdown, figures (label, value, tone up/down/neutral/warning), '
        + 'a table, a side-by-side comparison of 2-5 symbols, a small chart of a symbol with labelled levels, a callout, and buttons. Buttons can only open a symbol, '
        + 'set a price alert, or send a follow-up message (for example "Place it" or "Show me the 1h chart"). Use real numbers from your tools only. '
        + 'Prefer it for comparisons, scorecards, plans with several numbers, and choices for the user.',
      input: ChatViewSchema, run: input => Promise.resolve(input) }, deps),
    guardedTool({ name: 'showCustomView',
      description: 'Only when showView cannot express it: write a small self-contained HTML page (inline CSS and JS, no external files) that draws `data`, which the page reads from '
        + 'window.VIEW_DATA. It runs sandboxed with no login and no network; to act it calls window.requestAction({type, ...}) with an open-symbol, set-alert or ask action, '
        + 'which the user confirms. Keep it under 30 KB and use the data you pass, not invented numbers.',
      input: CustomViewSchema, run: input => Promise.resolve(input) }, deps),
  ];
}
