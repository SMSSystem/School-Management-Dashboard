import { describe, expect, it } from 'vitest';
import { inactivityTimeoutMs, LEARNER_INACTIVITY_MS, STAFF_INACTIVITY_MS } from '../inactivityTimeout';

describe('inactivityTimeoutMs', () => {
  it('gives staff five minutes', () => {
    for (const role of ['super_admin', 'institution_admin', 'senior_teacher', 'regular_teacher', 'spectator']) {
      expect(inactivityTimeoutMs(role)).toBe(STAFF_INACTIVITY_MS);
    }
    expect(STAFF_INACTIVITY_MS).toBe(5 * 60 * 1000);
  });

  it('gives students and parents thirty minutes', () => {
    expect(inactivityTimeoutMs('student')).toBe(LEARNER_INACTIVITY_MS);
    expect(inactivityTimeoutMs('parent')).toBe(LEARNER_INACTIVITY_MS);
    expect(LEARNER_INACTIVITY_MS).toBe(30 * 60 * 1000);
  });

  it('has no timeout when nobody is signed in or the role is unknown', () => {
    expect(inactivityTimeoutMs(null)).toBeNull();
    expect(inactivityTimeoutMs(undefined)).toBeNull();
    expect(inactivityTimeoutMs('')).toBeNull();
    expect(inactivityTimeoutMs('visitor')).toBeNull();
  });
});
