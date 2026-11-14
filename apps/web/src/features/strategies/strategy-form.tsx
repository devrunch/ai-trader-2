import { INTERVALS } from '@aitrader/contracts';
import { ConditionRows, fieldBox as box, IndicatorRows } from '../../shared/backtest-dsl';
import { BAR_FIELDS, INDICATOR_DEFAULTS, type StrategyForm } from './strategy-builder';

const num = (v: string, fallback: number): number => (v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);

export function StrategyFormFields({ form, onChange }: { form: StrategyForm; onChange: (form: StrategyForm) => void }) {
  const options = [...BAR_FIELDS, ...form.indicators.map(i => i.name).filter(Boolean)];
  const patch = (p: Partial<StrategyForm>) => { onChange({ ...form, ...p }); };
  return <div className="space-y-3 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1">Symbol <input aria-label="Symbol" className={`${box} w-32`} value={form.symbol} onChange={e => { patch({ symbol: e.target.value }); }} /></label>
      <label className="flex items-center gap-1">Interval <select aria-label="Interval" className={box} value={form.interval} onChange={e => { patch({ interval: INTERVALS.find(i => i === e.target.value) ?? form.interval }); }}>
        {INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}</select></label>
      <label className="flex items-center gap-1">Bars <input aria-label="Bars" type="number" className={`${box} w-20`} value={form.bars} onChange={e => { patch({ bars: num(e.target.value, form.bars) }); }} /></label>
      <label className="flex items-center gap-1">Side <select aria-label="Side" className={box} value={form.side} onChange={e => { patch({ side: e.target.value === 'short' ? 'short' : 'long' }); }}>
        <option value="long">Long</option><option value="short">Short</option></select></label>
    </div>
    <IndicatorRows items={form.indicators} defaults={INDICATOR_DEFAULTS} withPlot onChange={indicators => { patch({ indicators }); }} />
    <ConditionRows label="Entry" rows={form.entry} mode={form.entryMode} options={options} onRows={entry => { patch({ entry }); }} onMode={entryMode => { patch({ entryMode }); }} />
    <ConditionRows label="Exit" rows={form.exit} mode={form.exitMode} options={options} onRows={exit => { patch({ exit }); }} onMode={exitMode => { patch({ exitMode }); }} />
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1">Stop <input aria-label="Stop" className={`${box} w-24`} placeholder="2% or 2 x atr14" value={form.stopLoss} onChange={e => { patch({ stopLoss: e.target.value }); }} /></label>
      <label className="flex items-center gap-1">Target <input aria-label="Target" className={`${box} w-24`} placeholder="4% or 3 x atr14" value={form.takeProfit} onChange={e => { patch({ takeProfit: e.target.value }); }} /></label>
      <label className="flex items-center gap-1">Commission % <input aria-label="Commission %" type="number" step="0.01" className={`${box} w-16`} value={form.commissionPct} onChange={e => { patch({ commissionPct: num(e.target.value, form.commissionPct) }); }} /></label>
      <label className="flex items-center gap-1">Slippage % <input aria-label="Slippage %" type="number" step="0.01" className={`${box} w-16`} value={form.slippagePct} onChange={e => { patch({ slippagePct: num(e.target.value, form.slippagePct) }); }} /></label>
    </div>
  </div>;
}
