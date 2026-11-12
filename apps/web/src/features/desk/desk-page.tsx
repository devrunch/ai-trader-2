import { BacktestSection } from './backtest-section';
import { RunPanel } from './run-panel';

export function DeskPage({ symbol, onSymbol }: { symbol: string; onSymbol: (symbol: string) => void }) {
  return <div className="min-h-0 flex-1 space-y-6 overflow-auto p-3">
    <RunPanel symbol={symbol} onSymbol={onSymbol} />
    <BacktestSection symbol={symbol} />
  </div>;
}
