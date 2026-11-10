import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { PromptDetailSchema, PromptDiffSchema, PromptSummarySchema, PromptVersionSchema } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { Button } from '../../shared/ui/button';
import { PanelState, relative } from './panel-states';

const listSchema = z.array(PromptSummarySchema);
const savedSchema = z.object({ version: PromptVersionSchema.nullable() });
const key = (k: string) => ['admin', 'prompt', k] as const;

/** Agent prompts, edited like commits: every save is a version; diff, revert and reset (owner request 2026-11-10). */
export function PromptsPanel() {
  const list = useQuery({ queryKey: ['admin', 'prompts'], queryFn: ({ signal }) => apiFetch('/v1/admin/prompts', { schema: listSchema, signal }) });
  const [selected, setSelected] = useState<string | null>(null);
  return <PanelState query={list} isEmpty={d => d.length === 0} empty="No prompts.">{data => {
    const current = selected ?? data[0]?.key ?? '';
    return <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">{data.map(p => <Button key={p.key} size="xs" variant={p.key === current ? 'default' : 'outline'}
        onClick={() => { setSelected(p.key); }}>{p.key} · v{p.version}{p.source === 'file' ? ' (default)' : ''}</Button>)}</div>
      {current && <PromptEditor promptKey={current} />}
    </div>;
  }}</PanelState>;
}

function PromptEditor({ promptKey }: { promptKey: string }) {
  const client = useQueryClient();
  const detail = useQuery({ queryKey: key(promptKey), queryFn: ({ signal }) => apiFetch(`/v1/admin/prompts/${promptKey}`, { schema: PromptDetailSchema, signal }) });
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [diffFrom, setDiffFrom] = useState<number | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ['admin'] });
  const post = (path: string, body: unknown) => apiFetch(`/v1/admin/prompts/${promptKey}${path}`, { schema: savedSchema, method: 'POST', body });
  const save = useMutation({ mutationFn: (content: string) => post('', { content, message }), onSuccess: () => { setDraft(null); setMessage(''); void refresh(); } });
  const revert = useMutation({ mutationFn: (version: number) => post('/revert', { version }), onSuccess: () => { setDiffFrom(null); void refresh(); } });
  const reset = useMutation({ mutationFn: () => post('/reset', {}), onSuccess: () => { void refresh(); } });

  return <PanelState query={detail}>{data => {
    const content = draft ?? data.active.content;
    const dirty = draft !== null && draft !== data.active.content;
    return <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-2">
        <p className="text-muted-foreground">Active: v{data.active.version} ({data.active.source === 'file' ? 'file default' : 'edited'})</p>
        <textarea aria-label="Prompt content" value={content} onChange={e => { setDraft(e.target.value); }} rows={18}
          className="w-full rounded border bg-panel p-2 font-mono text-xs" />
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Change message" placeholder="What changed and why" value={message} onChange={e => { setMessage(e.target.value); }}
            className="min-w-60 flex-1 rounded border bg-panel px-2 py-1" />
          <Button size="sm" disabled={!dirty || message.trim() === '' || save.isPending} onClick={() => { save.mutate(content); }}>{save.isPending ? 'Saving…' : 'Save version'}</Button>
          <Button size="sm" variant="ghost" disabled={reset.isPending} onClick={() => { reset.mutate(); }}>Reset to file default</Button>
        </div>
        {(save.isError || revert.isError || reset.isError) && <p role="alert" className="text-down">Not saved: someone may have changed it meanwhile. Reload and try again.</p>}
        {diffFrom !== null && <DiffView promptKey={promptKey} from={diffFrom} to={data.active.version} />}
      </div>
      <ol aria-label="History" className="space-y-1">
        {data.history.map(v => <li key={v.version} className="rounded border px-2 py-1">
          <div className="flex justify-between"><span className="font-mono">v{v.version}</span><span className="text-muted-foreground">{relative(v.createdAt)}</span></div>
          <div className="truncate">{v.message}</div>
          <div className="text-xs text-muted-foreground">{v.author}</div>
          {v.version !== data.active.version && <div className="mt-1 flex gap-2">
            <Button size="xs" variant="outline" onClick={() => { setDiffFrom(v.version); }}>Diff v{v.version} → active</Button>
            <Button size="xs" variant="outline" disabled={revert.isPending} onClick={() => { revert.mutate(v.version); }}>Revert to v{v.version}</Button>
          </div>}
        </li>)}
        {data.history.length === 0 && <li className="text-muted-foreground">No edits yet: the file default is active.</li>}
      </ol>
    </div>;
  }}</PanelState>;
}

function DiffView({ promptKey, from, to }: { promptKey: string; from: number; to: number }) {
  const diff = useQuery({ queryKey: [...key(promptKey), 'diff', from, to],
    queryFn: ({ signal }) => apiFetch(`/v1/admin/prompts/${promptKey}/diff?from=${String(from)}&to=${String(to)}`, { schema: PromptDiffSchema, signal }) });
  return <PanelState query={diff}>{lines => <pre aria-label={`Diff v${String(from)} to v${String(to)}`} className="max-h-80 overflow-auto rounded border p-2 text-xs">
    {lines.map((l, i) => <div key={i} className={l.op === '+' ? 'text-up' : l.op === '-' ? 'text-down' : 'text-muted-foreground'}>{l.op} {l.line}</div>)}
  </pre>}</PanelState>;
}
