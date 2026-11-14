import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { AgentKnowledgeSchema, type AgentProfile } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { MemoryList } from './memory-list';

const KEY = ['agent', 'knowledge'];
const list = (text: string): string[] => text.split(',').map(s => s.trim()).filter(Boolean);
const field = 'rounded border bg-panel px-2 py-1';

/** "What the assistant knows about you": the profile (editable), the remembered notes and what it learned from your reactions, each deletable. */
export function Knowledge() {
  const client = useQueryClient();
  const knowledge = useQuery({ queryKey: KEY, queryFn: ({ signal }) => apiFetch('/v1/agent/knowledge', { schema: AgentKnowledgeSchema, signal }) });
  const refresh = () => client.invalidateQueries({ queryKey: KEY });
  const forget = useMutation({ mutationFn: (id: string | null) => apiFetch(id ? `/v1/agent/learned/${id}` : '/v1/agent/learned', { schema: z.unknown(), method: 'DELETE' }), onSettled: refresh });
  if (knowledge.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (knowledge.isError) return <p role="alert" className="text-down">What the assistant knows is unavailable right now.</p>;
  const { profile, learned, summary } = knowledge.data;
  return <div className="space-y-4">
    <h2 className="font-medium">What the assistant knows about you</h2>
    <ProfileForm key={JSON.stringify(profile)} profile={profile} onSaved={refresh} />
    <section aria-label="Notes"><h3 className="mb-1 text-xs uppercase text-muted-foreground">Notes</h3><MemoryList /></section>
    <section aria-label="Learned from your reactions" className="space-y-1">
      <h3 className="text-xs uppercase text-muted-foreground">Learned from your reactions</h3>
      {learned.length === 0 ? <p className="text-muted-foreground">Nothing yet. Mark replies useful or not, and apply or dismiss its cards.</p> : <>
        <pre className="whitespace-pre-wrap text-xs">{summary}</pre>
        <ul aria-label="Learned items" className="space-y-1">{learned.map(item => <li key={item.id} className="flex items-center gap-2 border p-2">
          <span className="min-w-0 flex-1">{item.kind} · {item.topic}{item.tools.length > 0 && <span className="text-muted-foreground"> · {item.tools.join(', ')}</span>}</span>
          <Button size="xs" variant="ghost" aria-label={`Forget: ${item.kind} ${item.topic}`} disabled={forget.isPending} onClick={() => { forget.mutate(item.id); }}>×</Button>
        </li>)}</ul>
        <Button size="xs" variant="outline" disabled={forget.isPending} onClick={() => { forget.mutate(null); }}>Forget everything learned</Button>
      </>}
    </section>
  </div>;
}

function ProfileForm({ profile, onSaved }: { profile: AgentProfile; onSaved: () => unknown }) {
  const [draft, setDraft] = useState({ markets: (profile.markets ?? []).join(', '), instruments: (profile.instruments ?? []).join(', '), timeframes: (profile.timeframes ?? []).join(', '),
    risk: profile.riskPerTradePct === undefined ? '' : String(profile.riskPerTradePct), autonomy: profile.autonomy ?? '', length: profile.length ?? '', format: profile.format ?? '', language: profile.language ?? '' });
  const set = (key: keyof typeof draft) => (e: { target: { value: string } }) => { setDraft(d => ({ ...d, [key]: e.target.value })); };
  const save = useMutation({ mutationFn: (body: AgentProfile) => apiFetch('/v1/agent/profile', { schema: z.unknown(), method: 'PUT', body }), onSuccess: () => onSaved() });
  const submit = () => {
    const risk = Number(draft.risk);
    const body: Record<string, unknown> = { markets: list(draft.markets), instruments: list(draft.instruments), timeframes: list(draft.timeframes),
      ...(draft.risk.trim() !== '' && risk > 0 ? { riskPerTradePct: risk } : {}), ...(draft.autonomy ? { autonomy: draft.autonomy } : {}),
      ...(draft.length ? { length: draft.length } : {}), ...(draft.format ? { format: draft.format } : {}), ...(draft.language.trim() ? { language: draft.language.trim() } : {}) };
    save.mutate(body);
  };
  return <form aria-label="Profile" className="grid gap-2 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); submit(); }}>
    <label className="grid gap-1">Markets<input className={field} value={draft.markets} onChange={set('markets')} placeholder="NSE, MCX" /></label>
    <label className="grid gap-1">Instruments<input className={field} value={draft.instruments} onChange={set('instruments')} placeholder="BANKNIFTY options" /></label>
    <label className="grid gap-1">Timeframes<input className={field} value={draft.timeframes} onChange={set('timeframes')} placeholder="5m, 1D" /></label>
    <label className="grid gap-1">Risk per trade (%)<input className={field} inputMode="decimal" value={draft.risk} onChange={set('risk')} /></label>
    <label className="grid gap-1">Paper orders<select className={field} value={draft.autonomy} onChange={set('autonomy')}>
      <option value="">Not set</option><option value="ask">Ask me every time</option><option value="within-limits">Act inside my limits</option></select></label>
    <label className="grid gap-1">Answer length<select className={field} value={draft.length} onChange={set('length')}>
      <option value="">Not set</option><option value="short">Short</option><option value="detailed">Detailed</option></select></label>
    <label className="grid gap-1">Format<select className={field} value={draft.format} onChange={set('format')}>
      <option value="">Not set</option><option value="cards">Cards</option><option value="text">Text</option></select></label>
    <label className="grid gap-1">Language<input className={field} value={draft.language} onChange={set('language')} placeholder="English" /></label>
    <div className="flex items-center gap-2 sm:col-span-2"><Button size="sm" type="submit" disabled={save.isPending}>Save profile</Button>
      {save.isError && <span role="alert" className="text-down">Could not save; check the values.</span>}</div>
  </form>;
}
