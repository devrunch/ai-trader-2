export class InvalidInstrumentIdError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;

  constructor(readonly raw: string, readonly reason: string) {
    super(`Invalid instrument ID: ${reason}`);
    this.name = 'InvalidInstrumentIdError';
  }
}
