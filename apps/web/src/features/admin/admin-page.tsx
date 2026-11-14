import { useNavigate, useSearch } from '@tanstack/react-router';
import { RequireRole } from '../auth/index';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../shared/ui/tabs';
import { FeedsPanel, InstrumentsPanel, JobsPanel } from './ops-panels';
import { SourcesPanel } from './sources-panel';
import { DataGapsPanel } from './data-gaps-panel';
import { ZerodhaCard } from './zerodha-card';
import { AlertsPanel } from './alerts-panel';
import { PromptsPanel } from './prompts-panel';
import { noticeMessage } from './zerodha-messages';

const TABS = ['zerodha', 'feeds', 'jobs', 'instruments', 'sources', 'needs', 'alerts', 'prompts'] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: unknown): value is Tab => typeof value === 'string' && (TABS as readonly string[]).includes(value);

export function AdminPage() {
  return <RequireRole role="admin"><AdminTabs /></RequireRole>;
}

function AdminTabs() {
  const search: { tab?: unknown; notice?: unknown } = useSearch({ strict: false });
  const navigate = useNavigate();
  const tab: Tab = isTab(search.tab) ? search.tab : 'zerodha';
  const notice = typeof search.notice === 'string' ? search.notice : undefined;
  const select = (next: string) => { void navigate({ to: '/admin', search: { tab: next, notice: undefined }, replace: true }); };

  return <main className="mx-auto w-full max-w-4xl space-y-4 p-6">
    <h1 className="text-xl font-semibold">Admin</h1>
    {notice && <div role="status" className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${notice === 'connected' ? 'border-up/40' : 'border-down/40 text-down'}`}>
      <span>{noticeMessage(notice)}</span>
      <button type="button" aria-label="Dismiss" className="text-muted-foreground" onClick={() => { select(tab); }}>✕</button>
    </div>}
    <Tabs value={tab} onValueChange={select}>
      <TabsList>{TABS.map(name => <TabsTrigger key={name} value={name} className="capitalize">{name === 'sources' ? 'Data sources' : name === 'needs' ? 'What the assistant needs' : name}</TabsTrigger>)}</TabsList>
      <TabsContent value="zerodha" className="pt-3"><ZerodhaCard /></TabsContent>
      <TabsContent value="feeds" className="pt-3"><FeedsPanel /></TabsContent>
      <TabsContent value="jobs" className="pt-3"><JobsPanel /></TabsContent>
      <TabsContent value="instruments" className="pt-3"><InstrumentsPanel /></TabsContent>
      <TabsContent value="sources" className="pt-3"><SourcesPanel /></TabsContent>
      <TabsContent value="needs" className="pt-3"><DataGapsPanel /></TabsContent>
      <TabsContent value="alerts" className="pt-3"><AlertsPanel /></TabsContent>
      <TabsContent value="prompts" className="pt-3"><PromptsPanel /></TabsContent>
    </Tabs>
  </main>;
}
