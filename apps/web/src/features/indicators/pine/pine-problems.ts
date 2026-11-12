import type { Diagnostic } from '@codemirror/lint';
import { ApiError } from '../../../shared/api/api-error';

export interface PineProblem { line?: number; message: string }

export function problemFromError(error: unknown): PineProblem | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const line: unknown = error.details?.line;
  return typeof line === 'number' && Number.isInteger(line) && line > 0 ? { line, message: error.message } : { message: error.message };
}

/** A problem without a line sits on line 1 so it is still visible in the gutter. */
export function diagnosticsFor(doc: string, problem: PineProblem): Diagnostic[] {
  const lines = doc.split('\n');
  const index = Math.min(Math.max((problem.line ?? 1) - 1, 0), lines.length - 1);
  const start = lines.slice(0, index).reduce((sum, l) => sum + l.length + 1, 0);
  const text = lines[index] ?? '';
  const indent = text.length - text.trimStart().length;
  const from = start + (indent < text.length ? indent : 0);
  return [{ from, to: start + text.length, severity: 'error', message: problem.message, source: 'pine' }];
}
