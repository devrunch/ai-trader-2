import { calendarFor } from '../domain/calendar';
import { addDaysToDate, dateAt } from '../domain/calendars/time';
import type { FillHistory } from './fill-history';
import type { HistoryInstruments } from './ports/history-instruments';
import type { ProviderResult } from './ports/market-data-provider';

type Counts = { written: number; repaired: number };
export class BackfillHeld {
  constructor(private readonly fill: Pick<FillHistory, 'execute'>, private readonly instruments: HistoryInstruments,
    private readonly clock: () => number, private readonly logger: { info(value: Record<string, unknown>): void }) {}

  async execute(signal: AbortSignal): Promise<Record<string, ProviderResult<Counts>>> {
    const results: Record<string, ProviderResult<Counts>> = {};
    const to = this.clock();
    for (const id of await this.instruments.held(signal)) {
      signal.throwIfAborted();
      let result: ProviderResult<Counts>;
      try { result = await this.fillInstrument(id, to, signal); }
      catch { signal.throwIfAborted(); result = { ok: false, reason: 'PROVIDER_DOWN' }; }
      results[id] = result;
      this.logger.info({ instrumentId: id, ...(result.ok ? result.data : { reason: result.reason }) });
    }
    return results;
  }

  private async fillInstrument(id: string, to: number, signal: AbortSignal): Promise<ProviderResult<Counts>> {
    const cal = calendarFor(id.split(':')[0] ?? '');
    let date = dateAt(to, cal.timezone); let count = 0; let from = to;
    // Count completed sessions, including special trading dates, rather than weekdays.
    while (count < 5) {
      const sessions = cal.sessionsOn(date).filter(session => session.close <= to);
      if (sessions.length) { count++; from = sessions[0]?.open ?? from; }
      date = addDaysToDate(date, -1);
    }
    const minute = await this.fill.execute(id, '1m', from, to, signal);
    const daily = await this.fill.execute(id, '1d', to - 400 * 86400000, to, signal);
    if (!minute.ok) return minute;
    if (!daily.ok) return daily;
    return { ok: true, data: { written: minute.data.written + daily.data.written, repaired: minute.data.repaired + daily.data.repaired } };
  }
}
