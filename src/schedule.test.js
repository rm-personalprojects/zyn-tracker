import { describe, it, expect } from 'vitest';
import { logicalDateStr, cutoffTimestamp, computeSchedule, MIN_GAP_MS } from './schedule.js';

const at = (s) => new Date(s).getTime();
const H = 60 * 60 * 1000;

describe('logicalDateStr', () => {
  it('counts 1am as the previous day', () => {
    expect(logicalDateStr(at('2026-11-24T01:00:00'))).toBe('2026-11-23');
  });
  it('rolls over at 5am', () => {
    expect(logicalDateStr(at('2026-11-24T05:00:00'))).toBe('2026-11-24');
  });
});

describe('cutoffTimestamp', () => {
  it('keeps an evening cutoff on the same day', () => {
    expect(cutoffTimestamp('2026-11-23', '23:00')).toBe(at('2026-11-23T23:00:00'));
  });
  it('moves an after-midnight cutoff to the next calendar day', () => {
    expect(cutoffTimestamp('2026-11-23', '01:00')).toBe(at('2026-11-24T01:00:00'));
  });
});

describe('computeSchedule', () => {
  const cutoff = at('2026-11-23T23:00:00');
  const entry = (start, mins = 30) => ({ start: at(start), end: at(start) + mins * 60000 });

  it('has nothing scheduled before the first one', () => {
    expect(computeSchedule([], 6, cutoff).nextAllowed).toBeNull();
  });

  it('spreads remaining uses evenly to the cutoff', () => {
    // First ends 8:00am, 5 left, 15h to cutoff → 3h apart
    const { gapMs } = computeSchedule([entry('2026-11-23T07:30:00')], 6, cutoff);
    expect(gapMs).toBe(3 * H);
  });

  it('keeps counting down after the target is reached', () => {
    const entries = ['07:30', '10:30', '13:30', '16:30', '19:30', '22:00'].map((t) =>
      entry(`2026-11-23T${t}:00`)
    );
    const { nextAllowed, gapMs } = computeSchedule(entries, 6, cutoff);
    expect(Number.isFinite(nextAllowed)).toBe(true);
    expect(gapMs).toBe(3 * H);
  });

  it('never drops below the minimum gap near the cutoff', () => {
    const entries = [entry('2026-11-23T07:30:00'), entry('2026-11-23T22:50:00', 5)];
    expect(computeSchedule(entries, 10, cutoff).gapMs).toBeGreaterThanOrEqual(MIN_GAP_MS);
  });
});
