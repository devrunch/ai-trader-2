import { useState } from 'react';
import { Bell, List, Search, Sparkles, Wallet, X } from 'lucide-react';

const KEY = 'guide.terminal.v1';
const seen = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } };

const TIPS = [
  { icon: Search, text: 'Type anywhere to search a symbol: stocks, F&O, forex, gold, US, crypto.' },
  { icon: List, text: 'Watchlist, Alerts and watches, and News are in the rail on the right.' },
  { icon: Sparkles, text: 'Ask AI for a setup: it answers with a trade card you can draw, alert on or paper-trade.' },
  { icon: Bell, text: 'Alerts and the agent’s reports land in the bell.' },
  { icon: Wallet, text: 'Paper trading is below the chart: ₹10 lakh, no real money.' },
];

/** A one-time strip that says what each part of the terminal is for; dismissed for good once closed. */
export function TerminalGuide() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;
  const close = () => { try { localStorage.setItem(KEY, '1'); } catch { /* private mode: it just shows again next time */ } setOpen(false); };
  return <aside aria-label="How the terminal works" className="flex shrink-0 items-start gap-3 border-b bg-panel px-3 py-2 text-sm">
    <ul className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-1">
      {TIPS.map(({ icon: TipIcon, text }) => <li key={text} className="flex items-center gap-1.5 text-muted-foreground"><TipIcon className="size-3.5 shrink-0 text-link" aria-hidden="true" />{text}</li>)}
    </ul>
    <button type="button" onClick={close} className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 font-medium hover:bg-muted"><X className="size-3.5" aria-hidden="true" />Got it</button>
  </aside>;
}
