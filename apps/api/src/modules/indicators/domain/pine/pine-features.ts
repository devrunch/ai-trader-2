import { PineScriptError, PineUnsupportedError } from './pine-errors';

/** Features the engine refuses up front (FR-IN-4). Order matters: the first match on the earliest line wins. */
const UNSUPPORTED: readonly { feature: string; pattern: RegExp }[] = [
  { feature: 'strategy()', pattern: /^\s*strategy\s*\(/ },
  { feature: 'library()', pattern: /^\s*library\s*\(/ },
  { feature: 'import', pattern: /^\s*import\s+[\w/.]+\/\d+/ },
  { feature: 'strategy.*', pattern: /\bstrategy\.\w+/ },
  { feature: 'request.financial', pattern: /\brequest\.financial\b/ },
  { feature: 'request.earnings', pattern: /\brequest\.earnings\b/ },
  { feature: 'request.dividends', pattern: /\brequest\.dividends\b/ },
  { feature: 'request.splits', pattern: /\brequest\.splits\b/ },
  { feature: 'request.economic', pattern: /\brequest\.economic\b/ },
  { feature: 'request.quandl', pattern: /\brequest\.quandl\b/ },
  { feature: 'request.seed', pattern: /\brequest\.seed\b/ },
];

function stripComment(line: string): string {
  const at = line.indexOf('//');
  return at < 0 ? line : line.slice(0, at);
}

/** The first unsupported feature in the source, with its 1-based line, or `null`. */
export function findUnsupported(source: string): { feature: string; line: number } | null {
  const lines = source.split('\n');
  for (const [i, raw] of lines.entries()) {
    const line = stripComment(raw);
    for (const { feature, pattern } of UNSUPPORTED) if (pattern.test(line)) return { feature, line: i + 1 };
  }
  return null;
}

function lineOf(source: string, word: string): number | undefined {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^\\w.])${escaped}($|[^\\w])`);
  const index = source.split('\n').findIndex(line => pattern.test(stripComment(line)));
  return index < 0 ? undefined : index + 1;
}

/** Turns a PineTS failure into an error that names the line and feature where the message or source shows them. */
export function classifyPineFailure(message: string, source: string): PineUnsupportedError | PineScriptError {
  const version = /Unsupported Pine Script version (\d+)/.exec(message);
  if (version) return new PineUnsupportedError(`Pine v${version[1] ?? ''}`, lineOf(source, '@version') ?? 1);
  const missing = /^(?:Undeclared identifier "([^"]+)"|([\w.]+) is not a function)/.exec(message);
  const feature = missing?.[1] ?? missing?.[2];
  if (feature) return new PineUnsupportedError(feature, lineOf(source, feature));
  const at = /\bat (\d+):\d+/.exec(message);
  return new PineScriptError(message.replace(/^Failed to transpile Pine Script version \d+: /, ''), at ? Number(at[1]) : undefined);
}
