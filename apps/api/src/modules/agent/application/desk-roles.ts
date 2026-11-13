import { z } from 'zod';
import { DeskArgumentSchema, DeskProposalSchema, DeskReportSchema, DeskRiskReviewSchema, type DeskArgument, type DeskProposal, type DeskReport, type DeskRiskReview } from '@aitrader/contracts';
import type { DeskSnapshot } from './desk-data';

type DeskRole = 'news' | 'technical' | 'macro' | 'fundamentals' | 'bull' | 'bear' | 'trader' | 'risk';
export interface RoleCall<T> { role: DeskRole; system: string; prompt: string; schema: z.ZodType<T> }

const RULES = 'Use only the data in the message. It is the complete picture as of the stated time; do not use anything you may know about later events. '
  + 'Reply with the JSON object only, short and specific: no preamble, no markdown. Never invent prices, levels or news that are not in the data.';

const iso = (ms: number): string => new Date(ms).toISOString();
const num = (n: number | null): string => (n === null ? 'n/a' : String(Math.round(n * 100) / 100));

/** The data every role reads, as compact text with the as-of time on top. */
function renderFundamentals(f: NonNullable<DeskSnapshot['fundamentals']>): string {
  const r = f.ratios;
  const q = f.quarterly.slice(-4).map(p => `${p.period}: sales ${num(p.sales)} OPM% ${num(p.opmPct)} net profit ${num(p.netProfit)} EPS ${num(p.eps)}`).join('\n') || 'none';
  return [`Fundamentals (source ${f.source}, fetched ${f.fetchedAt}, results to ${f.reportDate ?? 'n/a'}${f.stale ? ', STALE: refresh failed' : ''}${f.consolidated ? ', consolidated' : ''}):`,
    `Market cap ${num(r.marketCap)} Cr, P/E ${num(r.pe)}, book value ${num(r.bookValue)}, ROE ${num(r.roe)}%, ROCE ${num(r.roce)}%, dividend yield ${num(r.dividendYield)}%, debt/equity ${num(r.debtToEquity)}`,
    `Growth: sales 3y ${num(r.salesGrowth3y)}% 5y ${num(r.salesGrowth5y)}%, profit 3y ${num(r.profitGrowth3y)}% 5y ${num(r.profitGrowth5y)}%`,
    `Holding: promoter ${num(r.promoterHolding)}%, FII ${num(r.fiiHolding)}%, DII ${num(r.diiHolding)}%`,
    `Recent quarters (oldest first):\n${q}`].join('\n');
}

function renderSnapshot(symbol: string, s: DeskSnapshot): string {
  const bar = (b: { time: number; open: number; high: number; low: number; close: number; volume: number | null }) => `${iso(b.time)} O${num(b.open)} H${num(b.high)} L${num(b.low)} C${num(b.close)} V${num(b.volume)}`;
  return [
    `Instrument ${symbol}. As of ${iso(s.asOf)}. Last close ${num(s.lastClose)}.`,
    `Indicators on 5m (last closed bar): ${Object.entries(s.indicators).map(([k, v]) => `${k}=${num(v)}`).join(', ')}`,
    `Daily bars (oldest first):\n${s.daily.map(bar).join('\n') || 'none'}`,
    `Last 5m bars (oldest first):\n${s.intraday.slice(-20).map(bar).join('\n') || 'none'}`,
    `Headlines (newest first):\n${s.headlines.map(h => `- ${iso(Date.parse(h.publishedAt))} [${h.impact}] ${h.title}${h.moves.length ? ` (moves ${h.moves.join(', ')}${h.direction ? `, ${h.direction}` : ''})` : ''}`).join('\n') || 'none'}`,
    ...(s.fundamentals ? [renderFundamentals(s.fundamentals)] : []),
    `Calendar around this time:\n${s.events.map(e => `- ${e.at} ${e.country} ${e.impact} ${e.title} (${e.released ? 'released' : 'scheduled'}) forecast ${e.forecast ?? 'n/a'} previous ${e.previous ?? 'n/a'}`).join('\n') || 'none'}`,
  ].join('\n\n');
}

const analyst = (role: 'news' | 'technical' | 'macro' | 'fundamentals', focus: string, symbol: string, s: DeskSnapshot): RoleCall<DeskReport> => ({
  role, schema: DeskReportSchema,
  system: `You are the ${role} analyst on a trading desk. ${focus} ${RULES} JSON: {"stance":"bullish|bearish|neutral","confidence":0..1,"summary":"<=3 sentences","evidence":["short bullet",...]}`,
  prompt: renderSnapshot(symbol, s),
});
export const newsAnalyst = (symbol: string, s: DeskSnapshot): RoleCall<DeskReport> => analyst('news', 'Judge what the headlines and their impact tags mean for this instrument in the next trading session.', symbol, s);
export const technicalAnalyst = (symbol: string, s: DeskSnapshot): RoleCall<DeskReport> => analyst('technical', 'Judge trend, momentum, volatility and nearby levels from the bars and indicators only.', symbol, s);
export const macroAnalyst = (symbol: string, s: DeskSnapshot): RoleCall<DeskReport> => analyst('macro', 'Judge the macro and sentiment backdrop from the calendar and headlines (rates, currency, commodities, risk appetite) as it bears on this instrument.', symbol, s);
export const fundamentalsAnalyst = (symbol: string, s: DeskSnapshot): RoleCall<DeskReport> => analyst('fundamentals', 'Judge valuation, profitability, balance-sheet strength, growth and promoter/institutional holding from the fundamentals block only, and what they imply over a longer horizon than the next session. Say so if the data is stale.', symbol, s);

type Reports = Record<'news' | 'technical' | 'macro' | 'fundamentals', DeskReport | { skipped: string }>;
const reportsText = (r: Reports): string => (Object.entries(r) as Array<[string, DeskReport | { skipped: string }]>)
  .map(([k, v]) => ('skipped' in v ? `${k}: skipped (${v.skipped})` : `${k}: ${v.stance} (${String(v.confidence)}) ${v.summary} Evidence: ${v.evidence.join('; ')}`)).join('\n');
const debateText = (d: DeskArgument[]): string => d.map(a => `${a.side.toUpperCase()} round ${String(a.round)}: ${a.argument} | rebuttal: ${a.rebuttal}`).join('\n') || 'none yet';

export const researcher = (side: 'bull' | 'bear', round: number, symbol: string, s: DeskSnapshot, reports: Reports, debate: DeskArgument[]): RoleCall<DeskArgument> => ({
  role: side, schema: DeskArgumentSchema,
  system: `You are the ${side} researcher. Make the strongest honest case ${side === 'bull' ? 'for buying' : 'against buying (for selling or staying out)'} ${symbol}, and answer the other side's last argument in "rebuttal" (empty if there is none yet). ${RULES} `
    + `JSON: {"side":"${side}","round":${String(round)},"argument":"<=5 sentences","keyPoints":["..."],"rebuttal":"<=3 sentences"}`,
  prompt: `${renderSnapshot(symbol, s)}\n\nAnalyst reports:\n${reportsText(reports)}\n\nDebate so far:\n${debateText(debate)}`,
});

export const trader = (symbol: string, s: DeskSnapshot, reports: Reports, debate: DeskArgument[], skills: string[]): RoleCall<DeskProposal> => ({
  role: 'trader', schema: DeskProposalSchema,
  system: `You are the trader. Weigh the reports and the debate and propose BUY, SELL or HOLD for ${symbol} for the next session. For BUY or SELL give entry, stopLoss and target as prices near the last close and the levels in the data (a buy needs stop < entry < target; a sell target < entry < stop), `
    + `the one playbook skill you followed (from: ${skills.join(', ') || 'none'}; null if none) and the rationale. For HOLD set entry, stopLoss and target to null. Position size is decided by the risk manager's code, not by you. ${RULES} `
    + 'JSON: {"action":"BUY|SELL|HOLD","confidence":0..1,"entry":number|null,"stopLoss":number|null,"target":number|null,"skill":string|null,"rationale":"<=5 sentences"}',
  prompt: `${renderSnapshot(symbol, s)}\n\nAnalyst reports:\n${reportsText(reports)}\n\nDebate:\n${debateText(debate)}`,
});

export const riskManager = (symbol: string, proposal: DeskProposal, gateBlocks: string[], reports: Reports, s: DeskSnapshot): RoleCall<DeskRiskReview> => ({
  role: 'risk', schema: DeskRiskReviewSchema,
  system: `You are the risk manager. Veto (approve=false) a proposal that is reckless given the data: stop beyond the recent range or too tight against volatility, a target that ignores a nearby level, trading into a high-impact release, low-conviction signals, or a case that rests on one weak source. `
    + `Approve only when you would take it. Give the reasons either way. The code gate already checked side, reward:risk and size. ${RULES} JSON: {"approve":boolean,"reasons":["..."]}`,
  prompt: `${renderSnapshot(symbol, s)}\n\nAnalyst reports:\n${reportsText(reports)}\n\nProposal: ${JSON.stringify(proposal)}\nCode gate blocks: ${gateBlocks.join('; ') || 'none'}`,
});
