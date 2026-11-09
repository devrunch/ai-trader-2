import type { SessionWindow } from './calendar';

const MINUTE = 60_000;

export interface Coverage {
  expected: number;
  stored: number;
  /** Missing minutes before and between stored bars; minutes after the last bar are summarised by `endsAt`. */
  gaps: Array<{ from: number; to: number }>;
  /** End of the last stored minute (null with no bars). Earlier than the close: an outage or calendar drift. */
  endsAt: number | null;
}

export function sessionCoverage(session: SessionWindow, storedTimes: readonly number[]): Coverage {
  const times = [...new Set(storedTimes)].filter(t => t >= session.open && t < session.close).sort((a, b) => a - b);
  const gaps: Coverage['gaps'] = [];
  let expectedNext = session.open;
  for (const time of times) {
    if (time > expectedNext) gaps.push({ from: expectedNext, to: time });
    expectedNext = time + MINUTE;
  }
  const last = times.at(-1);
  return { expected: Math.round((session.close - session.open) / MINUTE), stored: times.length, gaps, endsAt: last === undefined ? null : last + MINUTE };
}
