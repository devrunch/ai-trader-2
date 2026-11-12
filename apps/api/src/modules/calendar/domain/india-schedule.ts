import type { EconomicEvent } from '@aitrader/contracts';

type Impact = EconomicEvent['impact'];
export interface ScheduledRelease { title: string; at: string; impact: Impact }

/*
 * Sources (checked 2026-11-12):
 * - RBI MPC meeting schedule 2026-27, press release of 2026-03-23: https://www.rbi.org.in/scripts/annualpolicy.aspx
 *   The decision is announced on the last meeting day (~10:00 IST).
 * - MoSPI Advance Release Calendar 2026-27 (September 2026 update):
 *   https://www.mospi.gov.in/uploads/documents/releaseCalender/1791356248513-ARC_2026_27_Sept_2026.pdf
 *   Releases are at 16:00 IST. The calendar says a release falling on a holiday moves to the next working day, so
 *   dates that fall on a weekend are left out until MoSPI confirms them: CPI 2026-12-12, IIP 2026-11-28 / 2027-02-28 / 2027-03-28.
 * - WPI (Office of the Economic Adviser, Ministry of Commerce) publishes no calendar, only a "14th of the following month" rule: not listed.
 * - Releases after 2027-03 are not published yet.
 */
const rbi = (date: string): ScheduledRelease => ({ title: 'RBI Monetary Policy Decision', at: `${date}T10:00:00+05:30`, impact: 'High' });
const mospi = (title: string, date: string, impact: Impact): ScheduledRelease => ({ title, at: `${date}T16:00:00+05:30`, impact });

export const INDIA_SCHEDULE: readonly ScheduledRelease[] = [
  rbi('2026-04-08'), rbi('2026-06-05'), rbi('2026-08-05'), rbi('2026-10-07'), rbi('2026-12-04'), rbi('2027-02-05'),
  mospi('India CPI y/y', '2026-11-12', 'High'), mospi('India CPI y/y', '2027-01-12', 'High'),
  mospi('India CPI y/y', '2027-02-12', 'High'), mospi('India CPI y/y', '2027-03-12', 'High'),
  mospi('India IIP y/y', '2026-12-28', 'Medium'), mospi('India IIP y/y', '2027-01-28', 'Medium'),
  mospi('India GDP q/q', '2026-11-30', 'High'), mospi('India GDP q/q', '2027-02-26', 'High'),
];
