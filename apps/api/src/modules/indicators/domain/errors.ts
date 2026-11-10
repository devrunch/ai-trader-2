export class InvalidIndicatorInputError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;
  constructor(readonly input: string, reason: string) {
    super(`Input "${input}": ${reason}`);
    this.name = 'InvalidIndicatorInputError';
  }
}

export class UnknownIndicatorError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(readonly ref: string) {
    super(`Unknown indicator: ${ref}`);
    this.name = 'UnknownIndicatorError';
  }
}
