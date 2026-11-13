import { NewspaperIcon, ScalesIcon, ShieldCheckIcon, TargetIcon, UsersThreeIcon, type Icon } from '@phosphor-icons/react';
import { Page, PageHeader, Panel } from '../../shared/ui/page';
import { BacktestSection } from './backtest-section';
import { RunPanel } from './run-panel';

const STEPS: Array<{ icon: Icon; title: string; body: string }> = [
  { icon: NewspaperIcon, title: 'Analysts report', body: 'News, chart and macro analysts each read the market for this symbol.' },
  { icon: ScalesIcon, title: 'Bull and bear argue', body: 'One argues for a trade, one against, from those reports.' },
  { icon: TargetIcon, title: 'Trader drafts a plan', body: 'Buy, sell or hold, with entry, stop and target. Size is set by code.' },
  { icon: ShieldCheckIcon, title: 'Risk manager decides', body: 'Rules check reward against risk; a reviewer can veto and says why.' },
];

/** The AI Desk: a second opinion on one symbol from a team of AI roles, ending in buy, sell or hold with every step shown. */
export function DeskPage({ symbol, runId, onSymbol, onOpenRun }:
  { symbol: string; runId: string | undefined; onSymbol: (symbol: string) => void; onOpenRun: (id: string, symbol?: string) => void }) {
  return <Page>
    <PageHeader icon={UsersThreeIcon} title="AI Desk"
      description={<>Get a decision on one symbol from a team of AI roles, the way a trading desk would make it. It takes about a minute and
        you can leave the page while it works. Nothing is traded from here: use the plan on paper, or let a watch run the desk for you.</>} />
    <ol aria-label="How the desk decides" className="grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map(({ icon: StepIcon, title, body }, i) => <li key={title} className="flex gap-3 bg-panel p-3">
        <span className="font-display ai-text text-[1.4rem] font-semibold leading-none">{i + 1}</span>
        <span className="min-w-0"><span className="flex items-center gap-1.5 text-[13px] font-semibold"><StepIcon weight="duotone" className="size-4 text-muted-foreground" aria-hidden="true" />{title}</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{body}</span></span>
      </li>)}
    </ol>
    <RunPanel symbol={symbol} runId={runId} onSymbol={onSymbol} onOpenRun={onOpenRun} />
    <Panel title={`Score the desk on past days: ${symbol}`}>
      <p className="mb-3 text-muted-foreground">Replay the desk on up to 30 past dates and check its calls against what the price did next: hit rate, average R and drawdown. Each date uses one desk run.</p>
      <BacktestSection symbol={symbol} />
    </Panel>
  </Page>;
}
