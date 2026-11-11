import type { ReactNode } from 'react';

export const fieldClass = 'h-8 w-40 rounded-md border bg-background px-2 text-sm';
const smallField = 'h-8 w-24 rounded-md border bg-background px-2 text-sm';

/** A native select of `[value, label]` options. */
export function SelectField({ label, value, options, onChange, small = false }:
  { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void; small?: boolean }) {
  return <select aria-label={label} className={small ? smallField : fieldClass} value={value} onChange={event => { onChange(event.target.value); }}>
    {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
  </select>;
}

export function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number | 'any'; onChange: (value: number) => void }) {
  return <input type="number" aria-label={label} className={smallField} value={value} min={min} max={max} step={step}
    onChange={event => { const next = event.target.valueAsNumber; if (Number.isFinite(next)) onChange(next); }} />;
}

export function Row({ title, children }: { title: string; children: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-24">{title}</span><span className="flex flex-wrap items-center justify-end gap-2">{children}</span></div>;
}
