import { useState, type ReactNode } from 'react';
import { BookOpen, Bell, ChevronDown, ChevronUp, List, Newspaper, Sparkles, type LucideIcon } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../shared/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../shared/ui/tooltip';
import { useIsDesktop } from './use-is-desktop';

export type Widget = 'watchlist' | 'depth' | 'assistant' | 'alerts' | 'news';
type Props = { toolbar: ReactNode; chart: ReactNode; bottom: ReactNode; widgets: Record<Widget, ReactNode>; requestedWidget?: Widget | undefined };

const WIDGETS: Array<{ id: Widget; label: string; icon: LucideIcon }> = [
  { id: 'watchlist', label: 'Watchlist', icon: List },
  { id: 'depth', label: 'Order book', icon: BookOpen },
  { id: 'assistant', label: 'Assistant', icon: Sparkles },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'news', label: 'News', icon: Newspaper },
];

/** Toolbar on top; chart over a collapsible trading panel; one widget panel beside an icon rail (docs/design/terminal-ui.md). */
export function TerminalLayout({ toolbar, chart, bottom, widgets, requestedWidget }: Props) {
  const desktop = useIsDesktop();
  const [widget, setWidget] = useState<Widget | null>(requestedWidget ?? 'watchlist');
  // A new request from the URL (e.g. "Ask AI") opens that widget; adjusting state while rendering avoids an effect.
  const [lastRequest, setLastRequest] = useState(requestedWidget);
  if (requestedWidget !== lastRequest) { setLastRequest(requestedWidget); if (requestedWidget) setWidget(requestedWidget); }
  const [bottomOpen, setBottomOpen] = useState(true);
  if (!desktop) return <PhoneLayout toolbar={toolbar} chart={chart} bottom={bottom} widgets={widgets} />;
  const active = WIDGETS.find(w => w.id === widget);
  const strip = <div className="flex h-7 shrink-0 items-center gap-2 border-t bg-panel px-2 text-[12px]">
    <span className="font-semibold">Paper trading</span>
    <button type="button" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={bottomOpen ? 'Collapse trading panel' : 'Expand trading panel'} onClick={() => { setBottomOpen(open => !open); }}>
      {bottomOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
    </button>
  </div>;

  return <div className="flex min-h-0 flex-1 flex-col bg-background">
    <div className="flex h-10 shrink-0 items-center border-b bg-panel">{toolbar}</div>
    <div className="flex min-h-0 flex-1">
      {/* The group sizes itself to 100% of its parent; the wrapper keeps the rail on screen. */}
      <div className="min-w-0 flex-1"><ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel id="main" minSize="40%">
          <div className="flex h-full flex-col">
            {bottomOpen
              ? <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
                <ResizablePanel id="chart" defaultSize="70%" minSize="30%">
                  <section data-testid="region-chart" aria-label="Chart" className="h-full">{chart}</section>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel id="bottom" defaultSize="30%" minSize="12%">
                  <div className="flex h-full flex-col">{strip}
                    <section data-testid="region-bottom" aria-label="Paper trading" className="min-h-0 flex-1 overflow-auto bg-panel">{bottom}</section>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
              : <><section data-testid="region-chart" aria-label="Chart" className="min-h-0 flex-1">{chart}</section>{strip}</>}
          </div>
        </ResizablePanel>
        {active && <>
          <ResizableHandle />
          <ResizablePanel id="widget" defaultSize="24%" minSize="16%" maxSize="45%">
            <section data-testid="region-side" aria-label={active.label} className="flex h-full flex-col border-l bg-panel">
              <h2 className="flex h-8 shrink-0 items-center border-b px-3 text-[12px] font-semibold">{active.label}</h2>
              <div className="min-h-0 flex-1 overflow-auto">{widgets[active.id]}</div>
            </section>
          </ResizablePanel>
        </>}
      </ResizablePanelGroup></div>
      <nav aria-label="Widgets" className="flex w-11 shrink-0 flex-col items-center gap-1 border-l bg-panel py-2">
        {WIDGETS.map(({ id, label, icon: Icon }) => <Tooltip key={id}><TooltipTrigger asChild>
          <button type="button" aria-label={label} aria-pressed={widget === id}
            className={id === 'assistant'
              ? `ai-button grid size-8 place-items-center rounded-full ${widget === id ? 'ring-2 ring-[color-mix(in_srgb,var(--ai-3)_45%,transparent)] ring-offset-2 ring-offset-panel' : ''}`
              : `grid size-8 place-items-center rounded ${widget === id ? 'bg-muted text-link' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            onClick={() => { setWidget(current => (current === id ? null : id)); }}><Icon className="size-4" /></button>
        </TooltipTrigger><TooltipContent side="left">{label}</TooltipContent></Tooltip>)}
      </nav>
    </div>
  </div>;
}

type PhoneTab = 'chart' | 'trade' | Widget;
const PHONE_TABS: Array<{ id: PhoneTab; label: string }> = [
  { id: 'chart', label: 'Chart' }, { id: 'watchlist', label: 'Watchlist' }, { id: 'depth', label: 'Book' }, { id: 'trade', label: 'Trade' },
  { id: 'assistant', label: 'Assistant' }, { id: 'alerts', label: 'Alerts' }, { id: 'news', label: 'News' },
];

function PhoneLayout({ toolbar, chart, bottom, widgets }: Props) {
  const [tab, setTab] = useState<PhoneTab>('chart');
  const content = tab === 'chart' ? chart : tab === 'trade' ? bottom : widgets[tab];
  return <div className="flex min-h-0 flex-1 flex-col bg-background">
    <div className="flex h-11 shrink-0 items-center overflow-x-auto border-b bg-panel [&_a]:min-h-10 [&_a]:min-w-10 [&_button]:min-h-10 [&_button]:min-w-10">{toolbar}</div>
    <section aria-label={PHONE_TABS.find(t => t.id === tab)?.label} className={`min-h-0 flex-1 ${tab === 'chart' ? '' : 'overflow-auto bg-panel'}`}>{content}</section>
    <div role="tablist" aria-label="Sections" className="grid shrink-0 grid-cols-7 border-t bg-panel">
      {PHONE_TABS.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
        className={`h-11 min-w-0 truncate text-[11px] ${tab === t.id ? 'text-link' : 'text-muted-foreground'}`} onClick={() => { setTab(t.id); }}>{t.label}</button>)}
    </div>
  </div>;
}
