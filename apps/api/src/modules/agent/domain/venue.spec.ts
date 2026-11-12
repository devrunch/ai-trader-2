import { describe, expect, it } from 'vitest';
import { assertExecutionMode, chooseVenueKind } from './venue';

describe('execution mode guards', () => {
  it('production refuses broker mode with a clear error, and accepts paper', () => {
    expect(() => { assertExecutionMode('broker', 'production'); }).toThrow('EXECUTION_MODE=broker is not allowed when NODE_ENV=production');
    expect(() => { assertExecutionMode('paper', 'production'); }).not.toThrow();
    expect(() => { assertExecutionMode('broker', 'development'); }).not.toThrow();
  });

  it('is paper unless broker mode, a non-production environment and the user opt-in all hold', () => {
    const base = { mode: 'broker' as const, nodeEnv: 'development', optedIn: true };
    expect(chooseVenueKind(base)).toBe('broker');
    expect(chooseVenueKind({ ...base, optedIn: false })).toBe('paper');
    expect(chooseVenueKind({ ...base, mode: 'paper' })).toBe('paper');
    expect(chooseVenueKind({ ...base, nodeEnv: 'production' })).toBe('paper');
    expect(chooseVenueKind({ ...base, nodeEnv: 'test' })).toBe('broker');
  });
});
