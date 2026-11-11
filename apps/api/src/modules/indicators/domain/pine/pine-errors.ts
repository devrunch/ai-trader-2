/** A script the engine cannot run: names the feature and, where the source shows it, the line (FR-IN-4). */
export class PineUnsupportedError extends Error {
  readonly code = 'UNSUPPORTED' as const;
  constructor(readonly feature: string, readonly line: number | undefined) {
    super(`Unsupported Pine feature "${feature}"${line === undefined ? '' : ` at line ${String(line)}`}`);
    this.name = 'PineUnsupportedError';
  }
}

/** A script that fails to compile or run. */
export class PineScriptError extends Error {
  readonly code = 'VALIDATION_FAILED' as const;
  constructor(message: string, readonly line: number | undefined) {
    super(line === undefined ? message : `${message} (line ${String(line)})`);
    this.name = 'PineScriptError';
  }
}

export type PineLimitReason = 'PINE_TIMEOUT' | 'PINE_OUT_OF_MEMORY' | 'PINE_CRASHED';

/** E26: the worker running a script hit its limit or died; it is replaced and other indicators go on. */
export class PineWorkerError extends Error {
  readonly code = 'UNAVAILABLE' as const;
  constructor(readonly reason: PineLimitReason, message: string) {
    super(message);
    this.name = 'PineWorkerError';
  }
}
