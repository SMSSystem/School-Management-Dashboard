import { describe, expect, it } from 'vitest';
import rules from '../../../firestore.rules?raw';

// A student can be in additional classes (lib/studentClasses.ts). There is no emulator in this project, so
// this reads firestore.rules as text. The rules that decide what a student may read by class follow the
// student's classes (the home classId, or any class in classIds); the general attendance register is
// deliberately still the home class only.

const text = rules.split('\r\n').join('\n');

describe('firestore.rules: a student in several classes', () => {
  it('has a helper that accepts the home class or any class in classIds, and still works before classIds is written', () => {
    const helper = text.slice(text.indexOf('function inMyClasses(cid)'));
    const body = helper.slice(0, helper.indexOf('\n    }\n'));
    expect(body).toContain("'classIds' in me() && cid in me().classIds");
    expect(body).toContain("'classId' in me() && cid == me().classId");
  });

  it('lets a student read lesson notes and published assignments of any class they are in', () => {
    expect(text).toMatch(/myRole\(\) == 'student' && lessonNoteHasClass\(n\) && inMyClasses\(n\.classId\)/);
    expect(text).toMatch(/myRole\(\) == 'student' && inMyClasses\(resource\.data\.classId\)\s+&& resource\.data\.status == 'published'/);
    expect(text).not.toMatch(/n\.classId == me\(\)\.classId/);
    expect(text).not.toMatch(/resource\.data\.classId == me\(\)\.classId\s+&& resource\.data\.status/);
  });

  it('keeps the general attendance register on the home class', () => {
    const homeReads = text.match(/\.data\.classId == resource\.data\.classId/g) ?? [];
    expect(homeReads.length).toBeGreaterThanOrEqual(2); // the flat and the nested register
  });

  it('does not let a student write their own classes (only the admin clause of the users rule may)', () => {
    const start = text.indexOf('function ownerMayEditOwnProfile');
    expect(start).toBeGreaterThan(-1);
    const fn = text.slice(start, text.indexOf('\n    }\n', start));
    expect(fn).not.toContain('classId');
    expect(fn).not.toContain('classIds');
    expect(fn).not.toContain('classSubjects');
  });
});
