import { LayoutTemplate, Star, X } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { TEMPLATE_INDICATORS_MAX, type IndicatorTemplate } from '@aitrader/contracts';
import { ApiError } from '../../shared/api/api-error';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { useIndicatorStore } from './state/indicator-store';
import { byFavourite, useIndicatorTemplates, useTemplateActions } from './use-indicator-library';

const field = 'h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm';

/** Toolbar "Templates": save the chart's indicator set under a name, apply one to this chart, star favourites (FR-IN-14). */
export function IndicatorTemplatesMenu() {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => { setOpen(true); }}><LayoutTemplate />Templates</Button>
    {open && <TemplatesDialog onClose={() => { setOpen(false); }} />}
  </>;
}

function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const items = useIndicatorStore(state => state.items);
  const load = useIndicatorStore(state => state.load);
  const list = useIndicatorTemplates();
  const { create, favourite, remove } = useTemplateActions();
  const [name, setName] = useState('');
  const error = [create, favourite, remove].map(m => m.error).find(Boolean);
  const save = (event: SyntheticEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) create.mutate({ name: trimmed, items }, { onSuccess: () => { setName(''); } });
  };
  const apply = (template: IndicatorTemplate) => { load(template.items); onClose(); };
  return <Dialog title="Indicator templates" description="Save the indicators on this chart as a template, or apply one" onClose={onClose}>
    <form noValidate className="flex items-center gap-2" onSubmit={save}>
      <input aria-label="Template name" className={field} placeholder={items.length ? 'Name this set of indicators' : 'Add an indicator to save a template'}
        maxLength={60} value={name} disabled={items.length === 0} onChange={event => { setName(event.target.value); }} />
      <Button type="submit" disabled={!name.trim() || items.length === 0 || items.length > TEMPLATE_INDICATORS_MAX || create.isPending}>Save template</Button>
    </form>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error instanceof ApiError ? error.message : 'Could not update templates'}</p>}
    <ul aria-label="Templates" className="mt-3 max-h-72 divide-y overflow-auto">
      {list.isPending ? <li className="py-2 text-sm text-muted-foreground">Loading templates</li>
        : list.isError ? <li role="alert" className="py-2 text-sm text-destructive">Templates are unavailable right now.</li>
        : list.data.length === 0 ? <li className="py-2 text-sm text-muted-foreground">No templates yet.</li>
        : byFavourite(list.data).map(template => <li key={template.id} className="flex items-center gap-1 py-1">
          <Button size="icon-xs" variant="ghost" aria-pressed={template.favourite} aria-label={`${template.favourite ? 'Unfavourite' : 'Favourite'} ${template.name}`}
            onClick={() => { favourite.mutate({ id: template.id, favourite: !template.favourite }); }}><Star className={template.favourite ? 'fill-current' : ''} /></Button>
          <Button variant="ghost" className="h-7 flex-1 justify-start px-2 text-sm" aria-label={`Apply ${template.name}`} onClick={() => { apply(template); }}>
            <span className="truncate">{template.name}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{template.items.length} indicator{template.items.length === 1 ? '' : 's'}</span>
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label={`Delete ${template.name}`} onClick={() => { remove.mutate(template.id); }}><X /></Button>
        </li>)}
    </ul>
  </Dialog>;
}
