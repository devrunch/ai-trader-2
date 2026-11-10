import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

const PATTERNS: Record<string, string> = { Session: 'yyyy-MM-dd', Week: "RRRR-'W'II", Month: 'yyyy-MM', Quarter: "yyyy-'Q'Q", Year: 'yyyy' };

/** The anchor period a bar belongs to; a change of key starts a new VWAP period. Weeks start on Monday. */
export function anchorKey(time: number, anchor: string, timezone: string): string {
  const pattern = PATTERNS[anchor];
  if (!pattern) throw new Error(`Unsupported anchor: ${anchor}`);
  return format(new TZDate(time, timezone), pattern);
}
