import { StreamLanguage, StringStream, type StreamParser } from '@codemirror/language';

const KEYWORDS = new Set('if else for while switch var varip const import export method type enum and or not return break continue to by in'.split(' '));
const ATOMS = new Set(['true', 'false', 'na']);
const TYPES = new Set('int float bool string color series simple input line label box table'.split(' '));
const NAMESPACES = new Set('ta math input str array matrix map color request syminfo barstate timeframe session'.split(' '));
const BARE_BUILTINS = new Set(['plot', 'plotshape', 'plotchar', 'plotcandle', 'hline', 'fill', 'bgcolor', 'barcolor', 'indicator', 'strategy', 'alert', 'alertcondition', 'nz', 'na', 'close', 'open', 'high', 'low', 'volume', 'hl2', 'hlc3', 'ohlc4', 'bar_index', 'time']);
const WORD = /[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/;

function wordType(word: string): string {
  if (KEYWORDS.has(word)) return 'keyword';
  if (ATOMS.has(word)) return 'atom';
  if (TYPES.has(word) && !word.includes('.')) return 'type';
  const [head] = word.split('.');
  if (word.includes('.') ? NAMESPACES.has(head ?? '') || head === 'strategy' : BARE_BUILTINS.has(word)) return 'builtin';
  return 'variableName';
}

const parser: StreamParser<null> = {
  name: 'pine',
  startState: () => null,
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/\/\/\s*@version\s*=.*/)) return 'meta';
    if (stream.match(/\/\/.*/)) return 'comment';
    const quote = stream.peek();
    if (quote === '"' || quote === "'") {
      stream.next();
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '\\') stream.next();
        else if (ch === quote) break;
      }
      return 'string';
    }
    if (stream.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/)) return 'number';
    if (stream.match(WORD)) return wordType(stream.current());
    if (stream.match(/=>|[<>=!:]=|[-+*/%<>=?:]/)) return 'operator';
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: '//' } },
};

export const pineLanguage = StreamLanguage.define(parser);

/** Pure line tokenizer for tests; whitespace and untyped punctuation are left out. */
export function tokenizePine(line: string): { text: string; type: string }[] {
  const stream = new StringStream(line, 2, 2);
  const out: { text: string; type: string }[] = [];
  while (!stream.eol()) {
    stream.start = stream.pos;
    const type = parser.token(stream, null);
    if (type) out.push({ text: stream.current(), type });
  }
  return out;
}
