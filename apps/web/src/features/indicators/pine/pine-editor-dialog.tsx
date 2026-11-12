import { useState } from 'react';
import { Button } from '../../../shared/ui/button';
import { Dialog } from '../../../shared/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../shared/ui/tabs';
import { PineCheckSummary } from './pine-check-summary';
import { usePineDialog, type PineDialogTab, type PineDialogTarget } from './pine-dialog-store';
import { LazyPineEditor } from './pine-editor.lazy';
import { PineHelp } from './pine-help';
import { PineScriptsList } from './pine-scripts-list';
import { usePineEditor } from './use-pine-editor';

/** Dialog for writing, saving and adding Pine scripts. Loaded lazily so CodeMirror stays out of the main bundle. */
export default function PineEditorDialog({ target }: { target: PineDialogTarget }) {
  const close = usePineDialog(state => state.close);
  const editor = usePineEditor(target, close);
  const [tab, setTab] = useState<PineDialogTab>(target.tab);
  return <Dialog wide title="Pine script" description="Write, check, save and add a Pine script to the chart" onClose={close}>
    <Tabs value={tab} onValueChange={value => { setTab(value === 'scripts' || value === 'help' ? value : 'editor'); }}>
      <TabsList><TabsTrigger value="editor">Editor</TabsTrigger><TabsTrigger value="scripts">My scripts</TabsTrigger><TabsTrigger value="help">Help</TabsTrigger></TabsList>
      <TabsContent value="editor" className="space-y-2">
        <div className="flex items-center gap-2">
          <input aria-label="Script name" value={editor.name} maxLength={80} onChange={e => { editor.setName(e.target.value); }}
            className="h-8 flex-1 rounded border border-input bg-background px-2 text-[12px]" />
          {editor.saved && <>
            <select aria-label="Version" value={editor.saved.shownVersion} onChange={e => { void editor.openVersion(Number(e.target.value)); }}
              className="h-8 rounded border border-input bg-background px-1 text-[12px]">
              {editor.saved.versions.map(v => <option key={v.version} value={v.version}>v{v.version}</option>)}
            </select>
            <span className="num text-[11px] text-muted-foreground" data-testid="pine-saved">v{editor.saved.shownVersion} · {editor.saved.sourceHash.slice(0, 8)}</span>
          </>}
        </div>
        <div className="h-72 overflow-hidden rounded border border-border">
          <LazyPineEditor value={editor.source} onChange={editor.setSource} {...(editor.checker.problem ? { problem: editor.checker.problem } : {})} label="Pine source" />
        </div>
        <PineCheckSummary definition={editor.checker.definition} problem={editor.checker.problem} pending={editor.checker.pending} />
        {editor.saveError && <p role="alert" className="text-[12px] text-destructive">{editor.saveError}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={editor.busy} onClick={() => { void editor.check(); }}>Check</Button>
          <Button size="sm" variant="outline" disabled={editor.busy || editor.name.trim() === ''} onClick={() => { void editor.save(); }}>Save</Button>
          <Button size="sm" disabled={editor.busy} onClick={() => { void editor.addToChart(); }}>{editor.replacing ? 'Update on chart' : 'Add to chart'}</Button>
        </div>
      </TabsContent>
      <TabsContent value="scripts"><PineScriptsList onOpen={detail => { editor.load(detail); setTab('editor'); }} onAdd={source => { void editor.addToChart(source); }} /></TabsContent>
      <TabsContent value="help"><PineHelp /></TabsContent>
    </Tabs>
  </Dialog>;
}
