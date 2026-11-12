import { useState } from 'react';
import type { AlertCreate } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';

const SELECT = 'h-6 border bg-panel px-1';
const INPUT = 'h-6 min-w-0 border bg-panel px-1';
const MARKETS = ['all', 'india', 'us', 'forex', 'commodities'] as const;
const NEWS_IMPACTS = ['high', 'medium', 'low'] as const;
const EVENT_IMPACTS = ['High', 'Medium', 'Low'] as const;
const split = (text: string): string[] => text.split(',').map(s => s.trim()).filter(Boolean);
const label = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const CANONICAL = /^[A-Za-z0-9_]+:[A-Za-z0-9._&-]+$/;

/** News alert: market, optional symbols and keywords, minimum impact. Fires on every matching headline. */
export function NewsAlertFields({ pending, onCreate }: { pending: boolean; onCreate: (body: AlertCreate) => void }) {
  const [market, setMarket] = useState<(typeof MARKETS)[number]>('all');
  const [symbols, setSymbols] = useState('');
  const [keywords, setKeywords] = useState('');
  const [impact, setImpact] = useState<(typeof NEWS_IMPACTS)[number]>('medium');
  const symbolList = split(symbols).map(s => s.toUpperCase());
  const keywordList = split(keywords);
  const valid = symbolList.length <= 10 && symbolList.every(s => CANONICAL.test(s)) && keywordList.length <= 10 && keywordList.every(k => k.length >= 2 && k.length <= 40);
  return <form aria-label="New news alert" className="flex flex-wrap items-center gap-1.5" onSubmit={e => {
    e.preventDefault();
    if (!valid) return;
    onCreate({ trigger: { kind: 'news', markets: [market], symbols: symbolList, keywords: keywordList, minImpact: impact }, repeat: true });
    setSymbols(''); setKeywords('');
  }}>
    <select aria-label="Market" className={SELECT} value={market} onChange={e => { setMarket(MARKETS.find(m => m === e.target.value) ?? 'all'); }}>
      {MARKETS.map(m => <option key={m} value={m}>{m === 'us' ? 'US' : label(m)}</option>)}
    </select>
    <input aria-label="Symbols" className={`${INPUT} w-36`} placeholder="NSE:RELIANCE, …" value={symbols} onChange={e => { setSymbols(e.target.value); }} />
    <input aria-label="Keywords" className={`${INPUT} w-28`} placeholder="keywords" value={keywords} onChange={e => { setKeywords(e.target.value); }} />
    <select aria-label="Minimum impact" className={SELECT} value={impact} onChange={e => { setImpact(NEWS_IMPACTS.find(i => i === e.target.value) ?? 'medium'); }}>
      {NEWS_IMPACTS.map(i => <option key={i} value={i}>{label(i)}</option>)}
    </select>
    <Button size="xs" type="submit" disabled={!valid || pending}>Add</Button>
    <span className="basis-full text-muted-foreground">Notifies on every matching headline.</span>
  </form>;
}

/** Event alert: calendar events for the given countries, a few minutes after their release. */
export function EventAlertFields({ pending, onCreate }: { pending: boolean; onCreate: (body: AlertCreate) => void }) {
  const [countries, setCountries] = useState('');
  const [title, setTitle] = useState('');
  const [impact, setImpact] = useState<(typeof EVENT_IMPACTS)[number]>('High');
  const [minutes, setMinutes] = useState('5');
  const codes = split(countries).map(c => c.toUpperCase());
  const after = Number(minutes);
  const valid = codes.length <= 5 && codes.every(c => /^[A-Z]{3}$/.test(c)) && minutes.trim() !== '' && Number.isInteger(after) && after >= 0 && after <= 120
    && (title.trim() === '' || (title.trim().length >= 2 && title.trim().length <= 80));
  return <form aria-label="New event alert" className="flex flex-wrap items-center gap-1.5" onSubmit={e => {
    e.preventDefault();
    if (!valid) return;
    onCreate({ trigger: { kind: 'event', countries: codes, ...(title.trim() ? { title: title.trim() } : {}), minImpact: impact, afterMinutes: after }, repeat: true });
    setCountries(''); setTitle('');
  }}>
    <input aria-label="Countries" className={`${INPUT} w-28`} placeholder="USD, INR" value={countries} onChange={e => { setCountries(e.target.value); }} />
    <input aria-label="Title contains" className={`${INPUT} w-28`} placeholder="title contains" value={title} onChange={e => { setTitle(e.target.value); }} />
    <select aria-label="Minimum impact" className={SELECT} value={impact} onChange={e => { setImpact(EVENT_IMPACTS.find(i => i === e.target.value) ?? 'High'); }}>
      {EVENT_IMPACTS.map(i => <option key={i} value={i}>{i}</option>)}
    </select>
    <input aria-label="Minutes after release" inputMode="numeric" className={`${INPUT} num w-12`} value={minutes} onChange={e => { setMinutes(e.target.value); }} />
    <Button size="xs" type="submit" disabled={!valid || pending}>Add</Button>
    <span className="basis-full text-muted-foreground">Notifies once per matching event, after its release.</span>
  </form>;
}
