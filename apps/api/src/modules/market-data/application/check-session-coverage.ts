import { calendarForInstrument, type SessionWindow } from '../domain/calendar';
import { sessionCoverage, type Coverage } from '../domain/session-coverage';
import type { CandleStore } from './ports/candle-store';
import type { FillHistory } from './fill-history';

export interface InstrumentCoverage {
  instrumentId: string;
  calendarId: string;
  session: SessionWindow;
  coverage: Coverage;
  repairedGaps: number;
}

const DAY = 86_400_000;
const MAX_REPAIRS = 5;

/** One trading day's minute coverage per stored instrument; repairs gaps it can before reporting (daily data report). */
export class CheckSessionCoverage {
  constructor(private readonly store: Pick<CandleStore, 'range1m' | 'instrumentsWith1m'>, private readonly fill?: Pick<FillHistory, 'execute'>) {}

  async execute(date: string, signal: AbortSignal = AbortSignal.timeout(300_000)): Promise<InstrumentCoverage[]> {
    const day = Date.parse(`${date}T00:00:00Z`);
    const ids = await this.store.instrumentsWith1m(day - DAY, day + 2 * DAY, signal);
    const result: InstrumentCoverage[] = [];
    for (const instrumentId of ids) {
      let calendar;
      try { calendar = calendarForInstrument(instrumentId); } catch { continue; }
      for (const session of calendar.sessionsOn(date)) {
        let coverage = await this.measure(instrumentId, session, signal);
        let repairedGaps = 0;
        if (this.fill && coverage.gaps.length) {
          for (const gap of coverage.gaps.slice(0, MAX_REPAIRS)) {
            const filled = await this.fill.execute(instrumentId, '1m', gap.from, gap.to, signal);
            if (filled.ok) repairedGaps++;
          }
          coverage = await this.measure(instrumentId, session, signal);
        }
        if (coverage.stored > 0) result.push({ instrumentId, calendarId: calendar.id, session, coverage, repairedGaps });
      }
    }
    return result;
  }

  private async measure(instrumentId: string, session: SessionWindow, signal: AbortSignal): Promise<Coverage> {
    const bars = await this.store.range1m(instrumentId, session.open, session.close, signal);
    return sessionCoverage(session, bars.map(bar => bar.time));
  }
}
