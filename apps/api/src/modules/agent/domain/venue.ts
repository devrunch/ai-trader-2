export type VenueKind = 'paper' | 'broker';
export type ExecutionMode = 'paper' | 'broker';

class VenueConfigError extends Error { override readonly name = 'VenueConfigError'; }

/** Boot check: real-broker execution exists for development experiments only and is refused outright in production. */
export function assertExecutionMode(mode: ExecutionMode, nodeEnv: string): void {
  if (mode === 'broker' && nodeEnv === 'production') {
    throw new VenueConfigError('EXECUTION_MODE=broker is not allowed when NODE_ENV=production. The assistant trades paper money only; unset EXECUTION_MODE.');
  }
}

/** The broker venue needs all three: the mode switch, a non-production environment and the user's own opt-in. Anything else is paper. */
export function chooseVenueKind(input: { mode: ExecutionMode; nodeEnv: string; optedIn: boolean }): VenueKind {
  return input.mode === 'broker' && input.nodeEnv !== 'production' && input.optedIn ? 'broker' : 'paper';
}
