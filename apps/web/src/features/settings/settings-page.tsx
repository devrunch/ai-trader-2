import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GearSixIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { AssistantPrefsResponseSchema, AssistantPrefsSchema, type AssistantPrefs } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api';
import { AiButton } from '../../shared/ui/ai-button';
import { Field, Page, PageHeader, Panel, fieldClass } from '../../shared/ui/page';
import { Skeleton } from '../../shared/ui/skeleton';
import { ThemeToggle } from '../../shared/ui/theme-toggle';
import { Knowledge } from '../chat';
import { EmailToggle } from '../notifications';

const KEY = ['agent', 'prefs'];

/** The one place for how much the assistant does on its own and inside which limits. */
function AssistantSettings() {
  const client = useQueryClient();
  const prefs = useQuery({ queryKey: KEY, queryFn: ({ signal }) => apiFetch('/v1/agent/prefs', { schema: AssistantPrefsResponseSchema, signal }) });
  const [draft, setDraft] = useState<AssistantPrefs | null>(null);
  const save = useMutation({ mutationFn: (body: AssistantPrefs) => apiFetch('/v1/agent/prefs', { method: 'PUT', body: AssistantPrefsSchema.parse(body), schema: AssistantPrefsResponseSchema }),
    onSuccess: data => { client.setQueryData(KEY, data); setDraft(null); } });
  if (prefs.isPending) return <Skeleton className="h-40" />;
  if (prefs.isError) return <p role="alert" className="text-down">Settings could not be loaded. Reload the page to try again.</p>;
  const current = draft ?? { mode: prefs.data.mode, maxRiskPct: prefs.data.maxRiskPct, maxTradesPerDay: prefs.data.maxTradesPerDay };
  const set = (patch: Partial<AssistantPrefs>) => { setDraft({ ...current, ...patch }); };
  return <div className="space-y-4">
    {!prefs.data.allowed && <p role="status" className="border border-warning/50 p-3 text-sm">An admin has switched off trading by the assistant for now, so it asks you before every trade.</p>}
    <fieldset className="space-y-2" disabled={!prefs.data.allowed}>
      <legend className="mb-1 text-sm font-semibold">When a task&apos;s condition is met</legend>
      {([['act', 'Trade on paper by itself', 'It places the paper trade inside your limits, then tells you what it did and why, with one tap to close it.'],
        ['ask', 'Ask me first', 'It sends you a card with the trade; nothing is placed until you confirm.']] as const).map(([mode, title, text]) =>
        <label key={mode} className={`flex cursor-pointer gap-3 border p-3 ${current.mode === mode ? 'ai-border' : 'hover:bg-muted'}`}>
          <input type="radio" name="mode" className="mt-1" checked={current.mode === mode} onChange={() => { set({ mode }); }} />
          <span><span className="block font-semibold">{title}</span><span className="block text-sm text-muted-foreground">{text}</span></span>
        </label>)}
    </fieldset>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Risk per trade (% of the paper account)">
        <input type="number" min={0.1} max={2} step={0.1} className={fieldClass} value={current.maxRiskPct} onChange={e => { set({ maxRiskPct: Number(e.target.value) }); }} />
      </Field>
      <Field label="Trades per day, at most">
        <input type="number" min={1} max={10} step={1} className={fieldClass} value={current.maxTradesPerDay} onChange={e => { set({ maxTradesPerDay: Math.round(Number(e.target.value)) }); }} />
      </Field>
    </div>
    <p className="text-sm text-muted-foreground">Every trade still passes the paper risk check (a stop is required, reward against risk, the daily loss limit). Real accounts are off.</p>
    <div className="flex items-center gap-3">
      <AiButton disabled={draft === null || save.isPending || !AssistantPrefsSchema.safeParse(current).success} onClick={() => { save.mutate(current); }}>Save</AiButton>
      {save.isError && <span role="alert" className="text-sm text-down">Could not save. Risk must be 0.1 to 2%, and trades 1 to 10 a day.</span>}
      {save.isSuccess && draft === null && <span className="text-sm text-muted-foreground">Saved. New tasks follow this setting.</span>}
    </div>
  </div>;
}

/** Settings in one place: the assistant, what it knows about you, email, and appearance. */
export function SettingsPage() {
  return <Page className="max-w-3xl">
    <PageHeader icon={GearSixIcon} title="Settings" description="How much the assistant does on its own, what it knows about you, where reports go, and how the app looks." />
    <Panel ai title="The assistant"><AssistantSettings /></Panel>
    <Panel title="What the assistant knows about you" bodyClassName="p-0"><Knowledge /></Panel>
    <Panel title="Email reports" bodyClassName="p-0"><EmailToggle /></Panel>
    <Panel title="Appearance"><div className="flex items-center gap-3 text-sm"><span>Theme</span><ThemeToggle /></div></Panel>
  </Page>;
}
