import type { ReactNode } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../../shared/ui/resizable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../shared/ui/tabs';
import { useIsDesktop } from './use-is-desktop';
type Side = Record<'chat' | 'positions' | 'news' | 'alerts', ReactNode>;
type Props = { watchlist: ReactNode; chart: ReactNode; side: Side };
const sideNames = ['chat', 'positions', 'news', 'alerts'] as const;
function ContentTabs({ entries }: { entries: { name: string; content: ReactNode }[] }) {
  return <Tabs defaultValue={entries[0]?.name} className="flex h-full min-h-0 flex-col">
    <TabsList className="group-data-[orientation=horizontal]/tabs:h-auto w-full flex-wrap justify-start rounded-none border-b bg-panel p-2">
      {entries.map(({ name }) => <TabsTrigger key={name} value={name} className="capitalize">{name.charAt(0).toUpperCase() + name.slice(1)}</TabsTrigger>)}
    </TabsList>
    {entries.map(({ name, content }) => <TabsContent key={name} value={name} className="min-h-0 flex-1 overflow-auto p-4">{content}</TabsContent>)}
  </Tabs>;
}
export function TerminalLayout({ watchlist, chart, side }: Props) {
  const desktop = useIsDesktop();
  const entries = sideNames.map((name) => ({ name, content: side[name] }));
  if (!desktop) return <ContentTabs entries={[{ name: 'Chart', content: chart }, { name: 'Watchlist', content: watchlist }, ...entries]} />;
  return <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 bg-panel">
    <ResizablePanel defaultSize="18%" minSize="12%"><section data-testid="region-watchlist" aria-label="Watchlist" className="h-full overflow-auto p-4">{watchlist}</section></ResizablePanel>
    <ResizableHandle withHandle />
    <ResizablePanel defaultSize="56%" minSize="30%"><section data-testid="region-chart" aria-label="Chart" className="h-full overflow-auto p-4">{chart}</section></ResizablePanel>
    <ResizableHandle withHandle />
    <ResizablePanel defaultSize="26%" minSize="18%"><section data-testid="region-side" aria-label="Tools" className="h-full"><ContentTabs entries={entries} /></section></ResizablePanel>
  </ResizablePanelGroup>;
}
