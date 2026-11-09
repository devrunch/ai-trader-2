import type { InstrumentCoverage } from '../../market-data/application/index';

const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
const hhmm = (at: number) => time.format(at);
const EXAMPLES = 5;

/**
 * The daily data email: data that ends before the calendar close is grouped as calendar drift
 * (e.g. the closing auction); gaps that history fill could not repair are listed one by one.
 */
export function buildDataReport(date: string, rows: readonly InstrumentCoverage[]): { subject: string; text: string; issues: number } {
  const drift = new Map<string, InstrumentCoverage[]>();
  for (const row of rows) {
    const { endsAt } = row.coverage;
    if (endsAt === null || endsAt >= row.session.close) continue;
    const key = `${row.calendarId}|${hhmm(endsAt)}|${hhmm(row.session.close)}`;
    drift.set(key, [...(drift.get(key) ?? []), row]);
  }
  const gaps = rows.flatMap(row => row.coverage.gaps.map(gap => ({ id: row.instrumentId, ...gap })));
  const issues = drift.size + gaps.length;
  const lines = [`Data report for ${date} (IST)`,
    `Instruments checked: ${String(rows.length)} · Repaired gaps: ${String(rows.reduce((n, r) => n + r.repairedGaps, 0))} · Remaining gaps: ${String(gaps.length)}`];
  if (drift.size) {
    lines.push('', 'Calendar drift (data ends before the calendar close):');
    for (const [key, group] of drift) {
      const [calendar, end, close] = key.split('|');
      const names = group.slice(0, EXAMPLES).map(r => r.instrumentId).join(', ') + (group.length > EXAMPLES ? ', …' : '');
      lines.push(`- ${String(group.length)} ${calendar ?? ''} instruments end at ${end ?? ''} IST; the ${calendar ?? ''} calendar closes at ${close ?? ''} (${names})`);
    }
  }
  if (gaps.length) {
    lines.push('', 'Remaining gaps:');
    for (const gap of gaps) lines.push(`- ${gap.id}: ${hhmm(gap.from)}–${hhmm(gap.to)} IST (${String(Math.round((gap.to - gap.from) / 60_000))} min)`);
  }
  return { subject: `Data report ${date}: ${issues === 0 ? 'all complete' : `${String(issues)} issues`}`, text: lines.join('\n'), issues };
}
