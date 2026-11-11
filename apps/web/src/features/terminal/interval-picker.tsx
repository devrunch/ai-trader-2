import { useNavigate, useSearch } from '@tanstack/react-router';
import { isSecondInterval, SECOND_INTERVALS, type Interval } from '@aitrader/contracts';

const CHOICES: Array<{ value: Interval; label: string }> = [
  { value: '1', label: '1m' }, { value: '5', label: '5m' }, { value: '15', label: '15m' }, { value: '60', label: '1h' },
  { value: '240', label: '4h' }, { value: '1D', label: 'D' }, { value: '1W', label: 'W' },
];

export function IntervalPicker() {
  const { symbol, interval } = useSearch({ from: '/terminal' });
  const navigate = useNavigate();
  const go = (value: Interval) => { void navigate({ to: '/terminal', search: { symbol, interval: value } }); };
  const seconds = isSecondInterval(interval);
  return <div role="group" aria-label="Interval" className="flex items-center">
    {CHOICES.map(choice => {
      const active = interval === choice.value;
      return <button key={choice.value} type="button" aria-pressed={active}
        className={`h-7 min-w-7 rounded px-1.5 text-[12px] ${active ? 'text-link' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
        onClick={() => { go(choice.value); }}>{choice.label}</button>;
    })}
    <select aria-label="Seconds" value={seconds ? interval : ''} onChange={event => { const next = SECOND_INTERVALS.find(value => value === event.target.value); if (next) go(next); }}
      className={`h-7 w-9 cursor-pointer appearance-none rounded bg-transparent px-1.5 text-center text-[12px] ${seconds ? 'text-link' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
      <option value="" disabled hidden>s</option>
      {SECOND_INTERVALS.map(value => <option key={value} value={value}>{value.toLowerCase()}</option>)}
    </select>
  </div>;
}
