import { aggregate } from '../domain/aggregate';
import { calendarFor } from '../domain/calendar';
import type { Bar } from '../domain/bar';
import type { Interval } from '../domain/interval';
type AggregateInput = Omit<Bar, 'repaired'> & { repaired?: boolean | undefined };

export class AggregateLiveBars {
  execute(bars: readonly AggregateInput[], interval: Interval, instrumentId: string): Bar[] {
    const normalized: Bar[] = bars.map(({ repaired, ...bar }) => repaired === undefined ? bar : { ...bar, repaired });
    return aggregate(normalized, interval, calendarFor(instrumentId.split(':')[0] ?? ''));
  }
}
