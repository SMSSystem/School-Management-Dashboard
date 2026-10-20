import { describe, expect, it } from 'vitest';
import { studentDetailSource as studentPageRaw } from './studentDetailSource';

// A teacher may read student profiles only, so the rules refuse a query for the institution's parents. The
// student page offers that list for adding a parent, which only an institution admin can do, so it must not
// ask a teacher for it: the refusal would show an error toast every time a teacher opens a student.

const page = studentPageRaw.split('\r\n').join('\n');

describe("the student page's parents-to-choose-from read", () => {
  it('is skipped for a teacher', () => {
    const start = page.indexOf('// Load all parents in institution');
    expect(start, 'the parents listener should exist').toBeGreaterThan(-1);
    const effect = page.slice(start, page.indexOf('onLoadError("the parents to choose from")', start));
    expect(effect).toContain('isTeacherRole(role)');
    expect(effect).toContain('where("role", "==", "parent")');
  });
});
