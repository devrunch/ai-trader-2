import { ChartSpline } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../shared/ui/button';
import { Command, CommandInput, CommandItem, CommandList } from '../../shared/ui/command';
import { Dialog } from '../../shared/ui/dialog';
import { PineDialogHost } from './pine/pine-dialog-host';
import { usePineDialog } from './pine/pine-dialog-store';
import { useIndicatorStore } from './state/indicator-store';
import { useIndicatorCatalog } from './use-chart-indicators';

/** Toolbar button that opens a searchable list of indicators; picking one adds it to the chart. */
export function IndicatorPicker() {
  const [open, setOpen] = useState(false);
  const catalog = useIndicatorCatalog();
  const add = useIndicatorStore(state => state.add);
  const openPine = usePineDialog(state => state.open);
  return <>
    <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => { setOpen(true); }} disabled={!catalog.data}>
      <ChartSpline />Indicators
    </Button>
    {open && <Dialog title="Indicators" description="Search and add an indicator to the chart" onClose={() => { setOpen(false); }}>
      <Command label="Indicators">
        <CommandInput autoFocus placeholder="Search indicators" />
        <CommandList>
          <CommandItem value="New Pine script" onSelect={() => { openPine({ tab: 'editor' }); setOpen(false); }}>New Pine script</CommandItem>
          <CommandItem value="My scripts" onSelect={() => { openPine({ tab: 'scripts' }); setOpen(false); }}>My scripts</CommandItem>
          {catalog.data?.map(definition => <CommandItem key={definition.id} value={`${definition.name} ${definition.shortName}`}
            onSelect={() => { add(definition.id); setOpen(false); }}>
            <span className="flex-1">{definition.name}</span><span className="text-[11px] text-muted-foreground">{definition.shortName}</span>
          </CommandItem>)}
        </CommandList>
      </Command>
    </Dialog>}
    <PineDialogHost />
  </>;
}
