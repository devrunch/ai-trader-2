import { describe, expect, it } from 'vitest';
import { missedRunDecision, nextFire } from './job-scheduler';

// NFR-RB-5, E22, E25: startup misfire decisions are deterministic.
describe('missedRunDecision', () => {
  const fire = new Date('2026-11-08T00:50:00Z');
  it('missedRunDecision runs a run missed within grace', () => {
    expect(missedRunDecision(null, fire, new Date(fire.getTime() + 1000), 1000)).toBe('run');
  });
  it('missedRunDecision skips a run missed beyond grace', () => {
    expect(missedRunDecision(null, fire, new Date(fire.getTime() + 1001), 1000)).toBe('skip');
  });
  it('missedRunDecision is none when the last run covers the previous fire time', () => {
    expect(missedRunDecision(fire, fire, new Date(fire.getTime() + 1000), 1000)).toBe('none');
  });
});

describe('nextFire', () => {
  it('nextFire is the next cron occurrence in the job time zone', () => {
    expect(nextFire('0 7 * * *', 'Asia/Kolkata', new Date('2026-11-09T02:00:00Z'))).toBe('2026-11-10T01:30:00.000Z');
  });
  it('nextFire is null for an unparsable cron', () => {
    expect(nextFire('not a cron', 'Asia/Kolkata', new Date('2026-11-09T02:00:00Z'))).toBeNull();
  });
});
