import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_EVENT_TYPES,
  ACTIVITY_EVENT_LABELS,
  AUDIT_EVENT_LABELS,
  SECURITY_EVENT_TYPES,
  activityEventLabel,
  auditEventLabel,
  eventTypesForCategory,
  humanizeEventType,
} from '../auditEvents';

const allTypes = Object.keys(AUDIT_EVENT_LABELS);

describe('audit event categories', () => {
  it('cover every event type exactly once', () => {
    const combined = [...SECURITY_EVENT_TYPES, ...ACADEMIC_EVENT_TYPES];
    expect([...combined].sort()).toEqual([...allTypes].sort());
    expect(new Set(combined).size).toBe(combined.length);
  });

  it('fit a Firestore `in` query (30 values)', () => {
    expect(SECURITY_EVENT_TYPES.length).toBeLessThanOrEqual(30);
    expect(ACADEMIC_EVENT_TYPES.length).toBeLessThanOrEqual(30);
  });

  it('maps a category to its types, and "all" to no filter', () => {
    expect(eventTypesForCategory('security')).toBe(SECURITY_EVENT_TYPES);
    expect(eventTypesForCategory('academic')).toBe(ACADEMIC_EVENT_TYPES);
    expect(eventTypesForCategory('all')).toBeNull();
  });

  it('keeps routine teacher events out of the security category', () => {
    for (const t of ['attendance_edit', 'results_edit', 'comment_edit', 'lesson_note_edit', 'profile_edit']) {
      expect(SECURITY_EVENT_TYPES).not.toContain(t);
    }
  });
});

describe('labels', () => {
  it('gives every audit event type a readable label (no slugs)', () => {
    for (const label of Object.values(AUDIT_EVENT_LABELS)) expect(label).not.toMatch(/_/);
    expect(auditEventLabel('account_suspended')).toBe('Account deactivated');
  });

  it('labels the real Activity event types, including profile_update', () => {
    expect(activityEventLabel('profile_update')).toBe('Updated contact info');
    expect(Object.keys(ACTIVITY_EVENT_LABELS)).toContain('sign_in');
  });

  it('humanises an unknown type instead of showing the slug', () => {
    expect(auditEventLabel('some_future_event')).toBe('Some future event');
    expect(activityEventLabel('another_one')).toBe('Another one');
    expect(humanizeEventType('')).toBe('—');
  });
});
