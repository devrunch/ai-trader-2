export type SessionState = { label: string; open: boolean };
export type MarketStatus = { nse: SessionState; us: SessionState; greeting: string; clock: string };

const parts = (now: Date, timeZone: string) => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const get = (type: string) => f.find(p => p.type === type)?.value ?? '';
  return { weekday: get('weekday'), minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
};
const isWeekend = (weekday: string) => weekday === 'Sat' || weekday === 'Sun';
const hhmm = (h: number, m = 0) => h * 60 + m;

/** NSE cash hours 09:15–15:30 IST and the US session (pre 04:00, regular 09:30–16:00, post to 20:00 ET). Exchange holidays are not modelled. */
export function marketStatus(now: Date = new Date()): MarketStatus {
  const ist = parts(now, 'Asia/Kolkata');
  const et = parts(now, 'America/New_York');
  const nseOpen = !isWeekend(ist.weekday) && ist.minutes >= hhmm(9, 15) && ist.minutes < hhmm(15, 30);
  const usWeekday = !isWeekend(et.weekday);
  const usRegular = usWeekday && et.minutes >= hhmm(9, 30) && et.minutes < hhmm(16);
  const usExtended = usWeekday && !usRegular && et.minutes >= hhmm(4) && et.minutes < hhmm(20);
  const hour = Math.floor(ist.minutes / 60);
  return {
    nse: { open: nseOpen, label: nseOpen ? 'NSE open' : 'NSE closed' },
    us: { open: usRegular, label: usRegular ? 'US open' : usExtended ? 'US extended hours' : 'US closed' },
    greeting: hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening',
    clock: `${String(hour).padStart(2, '0')}:${String(ist.minutes % 60).padStart(2, '0')} IST`,
  };
}
