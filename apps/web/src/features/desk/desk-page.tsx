import { UsersThreeIcon } from '@phosphor-icons/react';
import { Page, PageHeader, Panel } from '../../shared/ui/page';
import { BacktestSection } from './backtest-section';
import { RunPanel } from './run-panel';

export function DeskPage({ symbol, onSymbol }: { symbol: string; onSymbol: (symbol: string) => void }) {
  return <Page>
    <PageHeader icon={UsersThreeIcon} title="Trading desk"
      description="News, technical and macro analysts report, a bull and a bear argue, the trader drafts a plan and the risk manager can veto it. Run it now or replay a past moment. Paper only." />
    <RunPanel symbol={symbol} onSymbol={onSymbol} />
    <Panel title={`Desk backtest for ${symbol}`}><BacktestSection symbol={symbol} /></Panel>
  </Page>;
}
