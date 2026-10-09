import { describe, expect, it } from 'vitest';
import type { UserDocument } from '../firebase';
import { canGenerateSchedule } from '../permissions';

const withFlag = (canGenerateSchedule: boolean) => ({ canGenerateSchedule }) as unknown as UserDocument;

describe('canGenerateSchedule', () => {
  it('is always true for super_admin and institution_admin', () => {
    expect(canGenerateSchedule('super_admin', null)).toBe(true);
    expect(canGenerateSchedule('institution_admin', null)).toBe(true);
  });

  it('is true for a senior teacher only when delegated', () => {
    expect(canGenerateSchedule('senior_teacher', withFlag(true))).toBe(true);
    expect(canGenerateSchedule('senior_teacher', withFlag(false))).toBe(false);
    expect(canGenerateSchedule('senior_teacher', null)).toBe(false);
  });

  it('is never true for a spectator, even with the flag set on its document', () => {
    expect(canGenerateSchedule('spectator', null)).toBe(false);
    expect(canGenerateSchedule('spectator', withFlag(true))).toBe(false);
  });

  it('is false for the other roles', () => {
    for (const role of ['regular_teacher', 'student', 'parent']) {
      expect(canGenerateSchedule(role, withFlag(true))).toBe(false);
    }
  });
});
