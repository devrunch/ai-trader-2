export class TimeoutError extends Error {
  override readonly name = 'TimeoutError';
}

export class CircuitOpenError extends Error {
  override readonly name = 'CircuitOpenError';

  constructor(readonly retryAfterMs: number) {
    super('Circuit is open');
  }
}

export class AbortedError extends Error {
  override readonly name = 'AbortedError';
}
