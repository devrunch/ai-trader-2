import type { Notifier } from '../../../shared/notify';
import type { AlertGate } from '../../../shared/notify';
import { isMarketOpen, isTradingDay, type InstrumentCoverage } from '../../market-data/application/index';
import { buildDataReport } from './data-report';

const IST = 'Asia/Kolkata';
const istDate = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/** Whether NSE trades on the IST date of `at` (weekends and holidays from the market-data calendar). */
export type TradingDay = (date: string) => boolean;
type Gate = Pick<AlertGate, 'open'>;
type Send = Pick<Notifier, 'send'>;

/** 08:45 IST on trading days: a session that is not connected costs the morning's data. */
export class ZerodhaReminder {
  constructor(private readonly kite: { status(): Promise<{ valid: boolean }> }, private readonly notifier: Send, private readonly gate: Gate,
    private readonly appUrl: string, private readonly clock: () => number = Date.now, private readonly tradingDay: TradingDay = defaultTradingDay) {}

  async run(): Promise<void> {
    const now = this.clock();
    const date = istDate(now);
    if (!this.tradingDay(date) || (await this.kite.status()).valid) return;
    if (!(await this.gate.open(`zerodha-reminder:${date}`, 20 * 3_600_000))) return;
    await this.notifier.send({ subject: 'Zerodha not connected',
      text: `Indian market data needs today's Zerodha session.\nConnect before 09:15 IST: ${this.appUrl}/admin?tab=zerodha` });
  }
}

/** 15:50 IST: what today's minute data covers, what was repaired, and where data and calendar disagree. */
export class DailyDataReport {
  constructor(private readonly coverage: { execute(date: string, signal: AbortSignal): Promise<InstrumentCoverage[]> },
    private readonly notifier: Send, private readonly clock: () => number = Date.now) {}

  async run(signal: AbortSignal = AbortSignal.timeout(600_000)): Promise<void> {
    const date = istDate(this.clock());
    const rows = await this.coverage.execute(date, signal);
    if (rows.length === 0) return;
    const report = buildDataReport(date, rows);
    await this.notifier.send({ subject: report.subject, text: report.text });
  }
}

const FEED_DOWN_MS = 5 * 60_000;
const WATCH_WINDOW_MS = 10 * 60_000;
const VENDORS = [['kite', 'NSE'], ['deriv', 'FX'], ['us-delayed', 'NASDAQ']] as const;

/** Every 5 minutes: failed jobs, and feeds down for 5 minutes while their market is open. Each alert at most hourly. */
export class OpsWatch {
  constructor(private readonly deps: {
    jobs: { list(): Array<{ name: string }>; lastRun(name: string): Promise<{ at: string; outcome: string } | null> };
    feeds: { state(vendor: string): Promise<{ state: string; at?: number }> };
    notifier: Send; gate: Gate; clock: () => number; marketOpen?: (exchange: string, at: number) => boolean;
  }) {}

  async run(): Promise<void> {
    const now = this.deps.clock();
    for (const { name } of this.deps.jobs.list()) {
      const last = await this.deps.jobs.lastRun(name);
      if (last?.outcome !== 'failed' || now - Date.parse(last.at) > WATCH_WINDOW_MS) continue;
      if (await this.deps.gate.open(`job:${name}`, 3_600_000)) {
        await this.deps.notifier.send({ subject: `Job failed: ${name}`, text: `The ${name} job failed at ${last.at}. See the admin Jobs tab.` });
      }
    }
    const open = this.deps.marketOpen ?? defaultMarketOpen;
    for (const [vendor, exchange] of VENDORS) {
      const feed = await this.deps.feeds.state(vendor);
      const down = feed.state === 'stale' || feed.state === 'reconnecting' || feed.state === 'stopped';
      if (!down || feed.at === undefined || now - feed.at < FEED_DOWN_MS || !open(exchange, now)) continue;
      if (await this.deps.gate.open(`feed:${vendor}`, 3_600_000)) {
        await this.deps.notifier.send({ subject: `Feed down: ${vendor} (${feed.state})`,
          text: `The ${vendor} feed has been ${feed.state} for ${String(Math.round((now - feed.at) / 60_000))} minutes during market hours. See the admin Feeds tab.` });
      }
    }
  }
}

const defaultTradingDay: TradingDay = date => isTradingDay('NSE', date);
const defaultMarketOpen = (exchange: string, at: number): boolean => isMarketOpen(exchange, at);
