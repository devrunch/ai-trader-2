import { useState } from 'react';
import type { IndicatorDefinition } from '@aitrader/contracts';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../shared/ui/tabs';
import { InputsTab } from './inputs-tab';
import { draftFrom, readDraft, type Draft } from './input-draft';
import type { SourceOption } from './source-refs';
import type { InputValues } from './state/indicator-store';
import type { Presentation } from './style';
import { StyleTab } from './style-tab';
import { VisibilityTab } from './visibility-tab';

type TabName = 'inputs' | 'style' | 'visibility';

/** TradingView's settings dialog: Inputs (FR-IN-9), Style (FR-IN-10) and Visibility (FR-IN-11). OK applies all three, Cancel drops every edit. */
export function IndicatorSettingsDialog({ definition, inputs, presentation, chained, sources, onApply, onClose }:
  { definition: IndicatorDefinition; inputs: InputValues; presentation: Presentation; /** Takes its source from another indicator, so the pane can be chosen. */ chained: boolean;
    /** Other indicators' plots usable as source (FR-IN-13). */ sources: readonly SourceOption[]; onApply: (values: InputValues, presentation: Presentation) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(definition.inputs, inputs));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [style, setStyle] = useState(presentation.style);
  const [visibility, setVisibility] = useState(presentation.visibility);
  const [tab, setTab] = useState<TabName>('inputs');
  const apply = () => {
    const read = readDraft(definition.inputs, draft);
    if (!read.ok) { setErrors(read.errors); setTab('inputs'); return; }
    onApply(read.values, { style, visibility });
    onClose();
  };
  return <Dialog title={`${definition.shortName} settings`} description={`Settings of ${definition.name}`} onClose={onClose}>
    <form noValidate onSubmit={event => { event.preventDefault(); apply(); }}>
      <Tabs value={tab} onValueChange={value => { setTab(value === 'style' || value === 'visibility' ? value : 'inputs'); }}>
        <TabsList><TabsTrigger value="inputs">Inputs</TabsTrigger><TabsTrigger value="style">Style</TabsTrigger><TabsTrigger value="visibility">Visibility</TabsTrigger></TabsList>
        <TabsContent value="inputs">
          <InputsTab defs={definition.inputs} draft={draft} errors={errors} sources={sources}
            onChange={(id, value) => { setDraft(current => ({ ...current, [id]: value })); }} onReset={() => { setDraft(draftFrom(definition.inputs, {})); setErrors({}); }} />
        </TabsContent>
        <TabsContent value="style"><StyleTab definition={definition} style={style} chained={chained} onChange={setStyle} /></TabsContent>
        <TabsContent value="visibility"><VisibilityTab visibility={visibility} onChange={setVisibility} /></TabsContent>
      </Tabs>
      <div className="flex justify-end gap-2 pt-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Ok</Button></div>
    </form>
  </Dialog>;
}
