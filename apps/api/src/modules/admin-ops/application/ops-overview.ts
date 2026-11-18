import { FEED_VENDORS, type OpsFeeds, type OpsInstruments, type OpsJobs } from '@aitrader/contracts';

type FeedVendor = (typeof FEED_VENDORS)[number];
type FeedState = OpsFeeds['vendors'][number];

export interface OpsPorts {
  feedStates: { get(vendor: FeedVendor): Promise<Omit<FeedState, 'vendor'>> };
  leadership: {
    leader(): Promise<OpsFeeds['leader']>;
    subscriptions(): Promise<OpsFeeds['subscriptions']>;
  };
  jobs: {
    list(): Array<{ name: string; cron: string; tz: string; next: string | null }>;
    lastRun(name: string): Promise<{ at: string; outcome: 'ok' | 'failed' | 'skipped'; error: string | null } | null>;
    has(name: string): boolean;
    runNow(name: string): Promise<boolean>;
    runningSince(name: string): Promise<string | null>;
  };
  sources: {
    list(): Promise<Array<{ source: string; status: string; reason: string | null; count: number; lastSuccessAt: string | null }>>;
  };
}

const INSTRUMENTS_JOB = 'instruments-refresh';

/** Read-mostly operations view for the admin panel (FR-AC-2). */
export class OpsOverview {
  constructor(private readonly ports: OpsPorts) {}

  async feeds(): Promise<OpsFeeds> {
    const [leader, subscriptions, vendors] = await Promise.all([
      this.ports.leadership.leader(),
      this.ports.leadership.subscriptions(),
      Promise.all(FEED_VENDORS.map(async vendor => ({ vendor, ...(await this.ports.feedStates.get(vendor)) }))),
    ]);
    return { leader, vendors, subscriptions };
  }

  async jobs(): Promise<OpsJobs> {
    return Promise.all(this.ports.jobs.list().map(async job => {
      const [last, runningSince] = await Promise.all([this.ports.jobs.lastRun(job.name), this.ports.jobs.runningSince(job.name)]);
      return { ...job, runningSince, lastRun: last ? { at: last.at, outcome: last.outcome, error: last.error } : null };
    }));
  }

  /** 'queued', 'already-queued' when a manual run is waiting to start, or 'unknown'. */
  async runJob(name: string): Promise<'queued' | 'already-queued' | 'unknown'> {
    if (!this.ports.jobs.has(name)) return 'unknown';
    return await this.ports.jobs.runNow(name) ? 'queued' : 'already-queued';
  }

  async instruments(): Promise<OpsInstruments> {
    const rows = await this.ports.sources.list();
    return {
      sources: rows.map(({ reason, ...row }) => (reason === null ? row : { ...row, reason })),
      total: rows.reduce((sum, row) => sum + row.count, 0),
    };
  }

  async refreshInstruments(): Promise<void> {
    await this.ports.jobs.runNow(INSTRUMENTS_JOB);
  }
}
