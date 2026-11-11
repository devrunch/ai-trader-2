import { ValidationError, UnavailableError } from '../../../../shared/errors';
import { PineScriptError, PineUnsupportedError, PineWorkerError } from '../../domain/pine/pine-errors';
import { classifyPineFailure } from '../../domain/pine/pine-features';
import { PineRemoteError } from './pine-pool';

/** Maps what a Pine run threw to the error the API shows: 422 for a script problem or limit (E26), with the line and feature when known (FR-IN-4). */
export function failure(error: unknown, source: string): Error {
  const mapped = error instanceof PineRemoteError ? classifyPineFailure(error.message, source) : error;
  if (mapped instanceof PineUnsupportedError) return new ValidationError(mapped.message, { reason: 'UNSUPPORTED', feature: mapped.feature, ...(mapped.line === undefined ? {} : { line: mapped.line }) });
  if (mapped instanceof PineScriptError) return new ValidationError(mapped.message, { reason: 'PINE_ERROR', ...(mapped.line === undefined ? {} : { line: mapped.line }) });
  if (mapped instanceof PineWorkerError) {
    return mapped.reason === 'PINE_CRASHED' ? new UnavailableError(mapped.message, { reason: mapped.reason }) : new ValidationError(mapped.message, { reason: mapped.reason });
  }
  return mapped instanceof Error ? mapped : new Error(String(mapped));
}
