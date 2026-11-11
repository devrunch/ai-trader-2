/**
 * The PASS/BLOCK check on every paper entry the assistant places (owner decision 2026-11-11, after the day-trader
 * skill packs' risk skill). Enforced in code, so it holds even when the model skips the skill.
 */
export interface RiskLimits {
  maxLossPerTrade: number; maxDailyLoss: number; minRewardRisk: number; maxEntriesPerDay: number;
  /** IST minutes from midnight; null means no window (24-hour markets). */
  windowStart: number | null; windowEnd: number | null;
}
export interface EntryOrder { symbol: string; side: 'buy' | 'sell'; quantity: number; entry: number; stopLoss?: number | undefined; target?: number | undefined; intraday: boolean }
export interface TodayEntry { symbol: string; side: 'buy' | 'sell'; plannedLoss: number }
export type RiskVerdict = { pass: true; plannedLoss: number } | { pass: false; blocks: string[] };

const money = (v: number) => v.toFixed(2);
const istMinutes = (now: number) => Math.floor(((now + 19_800_000) % 86_400_000) / 60_000);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function defaultLimits(initialCash: number, exchange: string): RiskLimits {
  const indian = ['NSE', 'BSE', 'NFO', 'MCX'].includes(exchange);
  return { maxLossPerTrade: initialCash * 0.01, maxDailyLoss: initialCash * 0.03, minRewardRisk: 1.5, maxEntriesPerDay: 10,
    windowStart: indian ? (exchange === 'MCX' ? 9 * 60 + 20 : 9 * 60 + 35) : null, windowEnd: indian ? (exchange === 'MCX' ? 23 * 60 : 15 * 60) : null };
}

export function checkEntry(order: EntryOrder, today: TodayEntry[], limits: RiskLimits, now: number): RiskVerdict {
  const blocks: string[] = [];
  const long = order.side === 'buy';
  let plannedLoss = 0;
  if (order.stopLoss === undefined) blocks.push('stop: an entry needs a stop loss');
  else if (long ? order.stopLoss >= order.entry : order.stopLoss <= order.entry) {
    blocks.push(`stop: ${money(order.stopLoss)} is on the wrong side of the entry ${money(order.entry)}`);
  } else {
    plannedLoss = order.quantity * Math.abs(order.entry - order.stopLoss);
    if (plannedLoss > limits.maxLossPerTrade) blocks.push(`loss: ${money(plannedLoss)} at the stop is over the per-trade limit ${money(limits.maxLossPerTrade)}`);
    if (order.target !== undefined) {
      const rr = Math.abs(order.target - order.entry) / Math.abs(order.entry - order.stopLoss);
      if ((long ? order.target <= order.entry : order.target >= order.entry)) blocks.push(`target: ${money(order.target)} is on the wrong side of the entry`);
      else if (rr < limits.minRewardRisk) blocks.push(`reward:risk: ${rr.toFixed(2)} is under ${String(limits.minRewardRisk)}`);
    }
    const used = today.reduce((sum, e) => sum + e.plannedLoss, 0);
    if (used + plannedLoss > limits.maxDailyLoss) blocks.push(`daily loss: ${money(used)} planned today plus ${money(plannedLoss)} is over ${money(limits.maxDailyLoss)}`);
  }
  if (today.length >= limits.maxEntriesPerDay) blocks.push(`trades: ${String(today.length)} entries today, the limit is ${String(limits.maxEntriesPerDay)}`);
  if (today.some(e => e.symbol === order.symbol && e.side === order.side)) blocks.push(`duplicate: a ${order.side} of ${order.symbol} was already entered today`);
  if (order.intraday && limits.windowStart !== null && limits.windowEnd !== null) {
    const m = istMinutes(now);
    if (m < limits.windowStart || m > limits.windowEnd) blocks.push(`window: intraday entries run ${hhmm(limits.windowStart)}–${hhmm(limits.windowEnd)} IST, it is ${hhmm(m)} IST`);
  }
  return blocks.length ? { pass: false, blocks } : { pass: true, plannedLoss };
}
