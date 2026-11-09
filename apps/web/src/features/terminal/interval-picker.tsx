import { useNavigate, useSearch } from '@tanstack/react-router';
import type { Interval } from '@aitrader/contracts';

const CHOICES: Array<{ value: Interval; label: string }> = [
  { value: '1', label: '1m' }, { value: '5', label: '5m' }, { value: '15', label: '15m' }, { value: '60', label: '1h' },
  { value: '240', label: '4h' }, { value: '1D', label: 'D' }, { value: '1W', label: 'W' },
];

export function IntervalPicker() {
  const { symbol, interval } = useSearch({ from: '/terminal' });
  const navigate = useNavigate();
  return <div role="group" aria-label="Interval" className="inline-flex rounded border text-xs">
    {CHOICES.map(choice => {
      const active = interval === choice.value;
      return <button key={choice.value} type="button" aria-pressed={active}
        className={`px-2 py-1 ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={() => { void navigate({ to: '/terminal', search: { symbol, interval: choice.value } }); }}>{choice.label}</button>;
    })}
  </div>;
}
