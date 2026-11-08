import { INSTRUMENT_TYPES } from '@aitrader/contracts';
import { Command, CommandInput, CommandList } from '../../shared/ui/command';
import { Dialog } from '../../shared/ui/dialog';
import { useSymbolSearchDialog } from './use-symbol-search';
import { SymbolSearchResults } from './symbol-search-results';

const exchanges = ['All', 'NSE', 'BSE', 'MCX', 'FX', 'OANDA', 'NASDAQ', 'NYSE'];
export function SymbolSearchDialog({ initial, onClose, onSelect }: { initial: string; onClose: () => void; onSelect: (id: string) => void }) {
  const { q, setQ, exchange, changeExchange, type, changeType, recents, query, select } = useSymbolSearchDialog(initial, onClose, onSelect);
  return <Dialog onClose={onClose}><Command label="Search symbols" shouldFilter={false} loop>
    <CommandInput aria-label="Search symbols" placeholder="Search symbols" value={q} onValueChange={setQ} />
    <div className="flex flex-wrap gap-2 py-3">{exchanges.map((name) => <button key={name} aria-pressed={(exchange ?? 'All') === name} className="rounded border px-2 py-1 text-sm aria-pressed:bg-accent" onClick={() => { changeExchange(name); }}>{name}</button>)}</div>
    <label className="flex items-center gap-2 pb-3 text-sm">Type<select className="rounded border bg-popover p-1" value={type ?? ''} onChange={(event) => { changeType(event.target.value); }}><option value="">All</option>{INSTRUMENT_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <CommandList><SymbolSearchResults query={query} q={q} recents={recents} onSelect={select} /></CommandList>
  </Command></Dialog>;
}
