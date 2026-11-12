type ImpactLevel = 'high' | 'medium' | 'low';
type ImpactDirection = 'up' | 'down' | 'unclear';
export interface ImpactAssessment { impact: ImpactLevel; moves: string[]; direction: ImpactDirection | null }

const MAX_MOVES = 6;

/** A rule fires when every pattern matches; patterns are whole-word and case-insensitive unless `cs`. */
const word = (src: string, cs = false): RegExp => new RegExp(`(?<![\\w&])(?:${src})(?![\\w&])`, cs ? '' : 'i');

const CENTRAL_BANK = word('rbi|fed|ecb|fomc', false);
const FED = word('Fed|FED|fomc|powell', true);
const POLICY_WORD = word('rates?|repo|policy|decision|holds?|cuts?|hikes?|meeting|minutes');

interface MoveRule { all: RegExp[]; moves: string[] }

const MOVE_RULES: MoveRule[] = [
  { all: [word('crude|brent|wti|opec')], moves: ['MCX:CRUDEOIL1!'] },
  { all: [word('rbi'), word('rates?|repo|policy')], moves: ['NSE:NIFTY', 'NSE:BANKNIFTY', 'FX:USDINR'] },
  { all: [FED], moves: ['US stocks', 'MCX:GOLD1!', 'FX:USDINR'] },
  { all: [word('gold')], moves: ['MCX:GOLD1!'] },
  { all: [word('rupee')], moves: ['FX:USDINR'] },
  { all: [word('budget|gdp|inflation|cpi')], moves: ['NSE:NIFTY'] },
  { all: [word('IT (?:results|earnings|stocks|services)', true)], moves: ['NSE:NIFTY'] },
];

const HIGH_RULES: RegExp[][] = [
  [CENTRAL_BANK, POLICY_WORD],
  [FED],
  [word('budget|cpi|inflation|gdp|opec|war|sanctions?|crash(?:es|ed)?|circuit breaker')],
  [word('sebi'), word('ban(?:s|ned)?')],
];

const MEDIUM = word(
  'earnings|results|upgrade[sd]?|downgrade[sd]?|m&a|merger|acquires?|acquisition|ipo|guidance|fiis?|diis?',
);

const RATE_OBJECT = '(?:the\\s+|key\\s+|repo\\s+|policy\\s+|interest\\s+)*rates?';
const UP = word(`rate cuts?|(?:cuts?|lowers?|slashes)\\s+${RATE_OBJECT}|record highs?|surg(?:e|es|ed)`);
const DOWN = word(`rate hikes?|(?:raises?|hikes?|lifts?)\\s+${RATE_OBJECT}|record lows?|crash(?:es|ed)?|plunge[sd]?`);

const matches = (text: string, all: RegExp[]): boolean => all.every(re => re.test(text));

/** Rule-based read of a headline: how much it matters, what it may move, and which way. */
export function assessImpact(text: string, symbols: string[]): ImpactAssessment {
  const extra = MOVE_RULES.filter(r => matches(text, r.all)).flatMap(r => r.moves);
  const moves = [...symbols, ...extra].filter((m, i, all) => all.indexOf(m) === i).slice(0, MAX_MOVES);

  const high = HIGH_RULES.some(rule => matches(text, rule));
  const impact: ImpactLevel = high ? 'high' : MEDIUM.test(text) || symbols.length > 0 ? 'medium' : 'low';

  const up = UP.test(text);
  const down = DOWN.test(text);
  let direction: ImpactDirection | null = null;
  if (up && down) direction = high ? 'unclear' : null;
  else if (up) direction = 'up';
  else if (down) direction = 'down';

  return { impact, moves, direction };
}
