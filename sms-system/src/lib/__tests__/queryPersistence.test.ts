import { describe, expect, it } from 'vitest';
import { PERSISTABLE_QUERY_ROOTS, isPersistableQueryKey } from '../queryPersistence';

describe('query persistence allow-list', () => {
  it('persists reference data', () => {
    for (const root of ['terms', 'classes', 'subjects', 'departments', 'academicYears', 'nonSchoolDays']) {
      expect(isPersistableQueryKey([root, 'inst-1'])).toBe(true);
    }
    expect(isPersistableQueryKey(['nextClassSlots', 'inst-1', 'c1', 't1'])).toBe(true);
  });

  it('never persists queries that hold personal data', () => {
    for (const root of [
      'users', 'classStudents', 'linkedChildren', 'houses',
      'profileActivity', 'profileAudit', 'profilePerformed', 'auditLog',
    ]) {
      expect(isPersistableQueryKey([root, 'inst-1'])).toBe(false);
    }
  });

  it('is private by default: an unknown or malformed key is not persisted', () => {
    expect(isPersistableQueryKey(['somethingNew', 'inst-1'])).toBe(false);
    expect(isPersistableQueryKey([])).toBe(false);
    expect(isPersistableQueryKey([42])).toBe(false);
  });

  it('keeps the allow-list free of the known personal-data roots', () => {
    for (const forbidden of ['users', 'houses', 'classStudents', 'linkedChildren']) {
      expect(PERSISTABLE_QUERY_ROOTS).not.toContain(forbidden);
    }
  });
});
