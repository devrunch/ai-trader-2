import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  BellRingingIcon, ChartBarIcon, ChartLineUpIcon, ClockCounterClockwiseIcon, CoinsIcon, CurrencyBtcIcon, CurrencyInrIcon, GlobeIcon, NewspaperIcon, NotebookIcon, ScalesIcon, ShieldCheckIcon, TargetIcon,
  type Icon,
} from '@phosphor-icons/react';
import { AiButton } from '../../shared/ui/ai-button';
import { Wordmark } from '../../shared/ui/brand-mark';
import { ThemeToggle } from '../../shared/ui/theme-toggle';
import { DeskPreview } from './desk-preview';

const MARKETS: Array<{ icon: Icon; name: string; detail: string }> = [
  { icon: ChartLineUpIcon, name: 'NSE and BSE', detail: 'Stocks, indices and F&O on live Zerodha ticks, with the order book' },
  { icon: CurrencyInrIcon, name: 'Forex', detail: 'Majors, crosses and the rupee, live' },
  { icon: CoinsIcon, name: 'Gold, silver, crude', detail: 'Spot and MCX contracts' },
  { icon: GlobeIcon, name: 'US stocks', detail: 'Nasdaq and NYSE, 15 minutes delayed' },
  { icon: CurrencyBtcIcon, name: 'Crypto', detail: 'Bitcoin, Ether and majors, around the clock' },
];

const DESK: Array<{ icon: Icon; title: string; body: string }> = [
  { icon: NewspaperIcon, title: 'Analysts read the market', body: 'Separate analysts look at the news, the chart, the economic calendar and company results, and each writes a short report.' },
  { icon: ScalesIcon, title: 'A bull and a bear argue', body: 'One makes the case for the trade, the other against it, using only what the analysts found.' },
  { icon: TargetIcon, title: 'The trader drafts a plan', body: 'Entry, stop and target, with the position sized by code to the risk you allow, never by the model.' },
  { icon: ShieldCheckIcon, title: 'The risk manager can say no', body: 'Rules check reward against risk and your loss limits first. Then a reviewer can veto, and says why.' },
];

const WATCHES: Array<{ ask: string; reply: string }> = [
  { ask: 'Tell me when RBI policy is out and how NIFTY reacts.', reply: 'Watching the RBI decision. I will report 5 minutes after release, with the move in NIFTY and BANKNIFTY.' },
  { ask: 'Ping me only if three or more sources report the same rupee story.', reply: 'Watching INR news. Single-source headlines stay quiet.' },
  { ask: 'Run the desk on RELIANCE at 9:20 every trading day.', reply: 'Scheduled. Each run lands in the desk history with the full reasoning.' },
];

function Section({ id, title, intro, children }: { id?: string; title: string; intro: string; children: ReactNode }) {
  return <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-16 md:px-8 md:py-24">
    <h2 className="font-display max-w-2xl text-3xl font-semibold tracking-tight md:text-[2.5rem] md:leading-[1.1]">{title}</h2>
    <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">{intro}</p>
    <div className="mt-10">{children}</div>
  </section>;
}

/** The public page for visitors who are not signed in. */
export function LandingPage() {
  return <div className="min-h-0 flex-1 overflow-y-auto bg-background text-base">
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-8">
        <Wordmark />
        <nav aria-label="Page sections" className="ml-6 hidden gap-5 text-base text-muted-foreground md:flex">
          <a href="#markets" className="hover:text-foreground">Markets</a><a href="#desk" className="hover:text-foreground">The desk</a>
          <a href="#watch" className="hover:text-foreground">Watches</a><a href="#practice" className="hover:text-foreground">Paper trading</a>
        </nav>
        <span className="ml-auto flex items-center gap-2"><ThemeToggle />
          <Link to="/login" search={{ redirect: undefined }} className="hidden h-9 items-center px-3 text-base font-medium hover:text-link sm:inline-flex">Sign in</Link>
          <AiButton size="sm" asChild><Link to="/login" search={{ redirect: '/terminal' }}>Open the desk</Link></AiButton>
        </span>
      </div>
    </header>

    <section className="relative overflow-hidden border-b">
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full opacity-[0.13] blur-3xl" style={{ background: 'var(--accent)' }} />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-16 md:px-8 lg:grid-cols-[1fr_1.05fr] lg:pt-24">
        <div>
          <h1 className="font-display text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.025em] sm:text-6xl lg:text-[4.1rem]">Eight analysts. One trade plan. You decide.</h1>
          <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-muted-foreground">
            AI Trader reads Indian, forex, commodity and US markets, argues both sides of every idea, and hands you an entry, a stop and a size.
            It practises on a paper account until you trust it.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <AiButton size="lg" asChild><Link to="/login" search={{ redirect: '/terminal' }}>Open the desk</Link></AiButton>
            <a href="#desk" className="inline-flex h-11 items-center border px-5 text-[15px] font-medium hover:bg-muted">See how it decides</a>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Paper trading by default. Real orders stay switched off.</p>
        </div>
        <DeskPreview />
      </div>
    </section>

    <Section id="markets" title="One terminal for every market you trade" intro="Charts, indicators, news and the economic calendar for each market, in one place, with the agent able to read all of it.">
      <ul className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {MARKETS.map(({ icon: MarketIcon, name, detail }) => <li key={name} className="bg-panel p-5">
          <MarketIcon weight="duotone" className="size-8 text-link" aria-hidden="true" />
          <p className="mt-4 font-semibold">{name}</p><p className="mt-1 text-base leading-snug text-muted-foreground">{detail}</p>
        </li>)}
      </ul>
    </Section>

    <section id="desk" className="scroll-mt-16 border-y bg-panel">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <h2 className="font-display max-w-2xl text-3xl font-semibold tracking-tight md:text-[2.5rem] md:leading-[1.1]">How the desk reaches a decision</h2>
        <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">Every run follows the same four steps and keeps the full record, so you can read why it said buy, sell or hold.</p>
        <ol className="mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
          {DESK.map(({ icon: StepIcon, title, body }, i) => <li key={title} className="relative">
            <div className="flex items-center gap-3">
              <span className="font-display ai-text text-[2.2rem] font-semibold leading-none">{i + 1}</span>
              <StepIcon weight="duotone" className="size-7 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="mt-4 font-semibold">{title}</p><p className="mt-2 text-base leading-relaxed text-muted-foreground">{body}</p>
          </li>)}
        </ol>
        <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 border-t pt-6 text-base text-muted-foreground">
          <span className="inline-flex items-center gap-2"><ClockCounterClockwiseIcon weight="duotone" className="size-5" aria-hidden="true" />Replay any past date: the desk only sees what existed then.</span>
          <span className="inline-flex items-center gap-2"><ChartBarIcon weight="duotone" className="size-5" aria-hidden="true" />Score it over 30 past days before trusting it.</span>
        </div>
      </div>
    </section>

    <Section id="watch" title="Tell it what to watch, in plain words" intro="Watches wake the agent on news, economic releases, prices and indicator crossings. It checks what happened and only interrupts you when it matters.">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex items-start gap-4 border p-6">
          <BellRingingIcon weight="duotone" className="size-10 shrink-0 text-link" aria-hidden="true" />
          <p className="text-base leading-relaxed text-muted-foreground">
            Each watch runs in the background and keeps a record of every wake-up, including the ones it decided not to report.
            A daily cap keeps the cost bounded.
          </p>
        </div>
        <ul className="space-y-4">
          {WATCHES.map(({ ask, reply }) => <li key={ask} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] bg-muted px-3 py-2 text-base">{ask}</p>
            <p className="ai-border w-fit max-w-[85%] px-3 py-2 text-base">{reply}</p>
          </li>)}
        </ul>
      </div>
    </Section>

    <section id="practice" className="scroll-mt-16 border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-[2.5rem] md:leading-[1.1]">Practise with ₹10 lakh of paper money</h2>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
            Let the agent trade a watch on its own, inside the limits you set: risk per trade, trades per day, and a backtest it must pass first.
            Every trade lands in a journal with the reason it was taken.
          </p>
          <div className="mt-8"><AiButton size="lg" asChild><Link to="/login" search={{ redirect: '/terminal' }}>Start on paper</Link></AiButton></div>
        </div>
        <div className="border bg-panel">
          <div className="flex items-center gap-2 border-b px-4 py-3 text-base font-semibold"><NotebookIcon weight="duotone" className="size-5 text-link" aria-hidden="true" />Trade journal</div>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Symbol</th><th className="px-2 py-2 font-medium">Why</th><th className="px-4 py-2 text-right font-medium">P&amp;L</th></tr></thead>
            <tbody className="num">
              <tr className="border-t"><td className="px-4 py-2.5 font-semibold">BANKNIFTY</td><td className="px-2 py-2.5 text-muted-foreground">Breakout after RBI held rates</td><td className="px-4 py-2.5 text-right text-up">+₹4,120</td></tr>
              <tr className="border-t"><td className="px-4 py-2.5 font-semibold">USD/INR</td><td className="px-2 py-2.5 text-muted-foreground">US CPI above forecast</td><td className="px-4 py-2.5 text-right text-up">+₹1,860</td></tr>
              <tr className="border-t"><td className="px-4 py-2.5 font-semibold">RELIANCE</td><td className="px-2 py-2.5 text-muted-foreground">Pullback to EMA50; stopped out</td><td className="px-4 py-2.5 text-right text-down">−₹4,998</td></tr>
              <tr className="border-t"><td className="px-4 py-2.5 font-semibold">GOLD</td><td className="px-2 py-2.5 text-muted-foreground">Skipped: backtest had 12 trades, needs 20</td><td className="px-4 py-2.5 text-right text-muted-foreground">—</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <footer className="border-t bg-panel">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-muted-foreground md:px-8">
        <Wordmark />
        <p className="max-w-[60ch]">Analysis, not investment advice. Trading carries risk of loss. The agent trades on paper unless real accounts are switched on in development.</p>
        <Link to="/login" search={{ redirect: undefined }} className="ml-auto font-medium text-foreground hover:text-link">Sign in</Link>
      </div>
    </footer>
  </div>;
}
