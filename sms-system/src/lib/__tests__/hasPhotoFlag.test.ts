import { describe, expect, it } from 'vitest';
import { needsPhotoFlag, planPhotoFlags } from '../../../scripts/backfillHasPhotoLogic.mjs';
import backfillRaw from '../../../scripts/backfill-has-photo.mjs?raw';
import { hasNoPhoto } from '../userPhotoKeys';
import studentFormRaw from '../../components/forms/StudentForm.tsx?raw';
import teacherFormRaw from '../../components/forms/TeacherForm.tsx?raw';
import createAccountRaw from '../createUserAccount.ts?raw';
import importCommitRaw from '../importStudentsCommit.ts?raw';
import studentsListRaw from '../../scenes/(dashboard)/list/students/index.tsx?raw';
import teachersListRaw from '../../scenes/(dashboard)/list/teachers/index.tsx?raw';

// The Students and Teachers lists skip the photo read for a person whose document says hasPhoto === false. The flag is
// written in the same batch as every photo write, and only an explicit false skips the read, so an account from
// before the flag is still read until scripts/backfill-has-photo.mjs sets it.

const lf = (s: string) => s.split('\r\n').join('\n');

describe('hasNoPhoto', () => {
  it('is true only for an explicit false', () => {
    expect(hasNoPhoto({ hasPhoto: false })).toBe(true);
    expect(hasNoPhoto({ hasPhoto: true })).toBe(false);
    expect(hasNoPhoto({})).toBe(false); // unknown: read once
    expect(hasNoPhoto({ hasPhoto: null })).toBe(false);
    expect(hasNoPhoto({ hasPhoto: 'false' })).toBe(false);
  });
});

describe('the writers set the flag with the photo', () => {
  it.each([
    ['Edit student', studentFormRaw],
    ['Edit teacher', teacherFormRaw],
  ])('%s: true with an upload, false with a removal, nothing otherwise, in the profile write of the same batch', (_n, raw) => {
    const src = lf(raw);
    expect(src).toContain('...(isPhotoEditor && pendingPhotoDataUrl && { hasPhoto: true }),');
    expect(src).toContain('...(isPhotoEditor && !pendingPhotoDataUrl && photoRemoved && { hasPhoto: false }),');
    // the flag is written before the batch commits, in the batch that also holds the photo document
    expect(src.indexOf('hasPhoto: true')).toBeLessThan(src.indexOf('batch.commit()'));
    expect(src.indexOf('hasPhoto: false')).toBeLessThan(src.indexOf('batch.commit()'));
  });

  it('Create account writes hasPhoto with the profile: true only if a photo is given', () => {
    expect(lf(createAccountRaw)).toContain('hasPhoto: !!photoDataUrl,');
  });

  it('a Students import has no photos, so it writes hasPhoto: false', () => {
    expect(lf(importCommitRaw)).toContain('hasPhoto: false,');
  });
});

describe('the lists', () => {
  it.each([
    ['Students', studentsListRaw, 's.uid'],
    ['Teachers', teachersListRaw, 't.id'],
  ])('%s do not read the photo of a person flagged as having none', (_n, raw, id) => {
    const src = lf(raw);
    expect(src).toContain('new Set((allUsers ?? []).filter(hasNoPhoto).map((u) => u.id))');
    expect(src).toContain(`!noPhotoIds.has(${id})`);
  });

  it('an edit that changes the photo still reads it afresh, whatever the flag said', () => {
    // refreshPhoto goes straight to fetchPhoto(…, true), which does not look at the flag
    expect(lf(studentsListRaw)).toContain('void fetchPhoto(uid, rowInstitutionId, true);');
    expect(lf(teachersListRaw)).toContain('void fetchPhoto(uid, rowInstitutionId, true);');
  });
});

describe('the backfill', () => {
  it('flags only students and teachers that have no flag yet', () => {
    expect(needsPhotoFlag({ id: 'a', role: 'student' })).toBe(true);
    expect(needsPhotoFlag({ id: 'a', role: 'senior_teacher' })).toBe(true);
    expect(needsPhotoFlag({ id: 'a', role: 'regular_teacher', hasPhoto: undefined })).toBe(true);
    expect(needsPhotoFlag({ id: 'a', role: 'student', hasPhoto: false })).toBe(false);
    expect(needsPhotoFlag({ id: 'a', role: 'student', hasPhoto: true })).toBe(false);
    expect(needsPhotoFlag({ id: 'a', role: 'parent' })).toBe(false);
    expect(needsPhotoFlag({ id: 'a', role: 'institution_admin' })).toBe(false);
  });

  it('sets true for the people found with a photo and false for the rest', () => {
    const plan = planPhotoFlags(
      [
        { id: 'with', role: 'student' },
        { id: 'without', role: 'regular_teacher' },
        { id: 'done', role: 'student', hasPhoto: false },
        { id: 'parent', role: 'parent' },
      ],
      new Set(['with', 'done']),
    );
    expect(plan).toEqual([
      { id: 'with', hasPhoto: true },
      { id: 'without', hasPhoto: false },
    ]);
  });

  it('is a dry run unless --live is given, and writes only behind that flag', () => {
    const script = lf(backfillRaw);
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    expect(script).toMatch(/const opts = \{[^}]*\blive: false\b/);
    expect(script.match(/opts\.live = true/g)).toHaveLength(1);
    expect(script.indexOf('batch.update(')).toBeGreaterThan(script.indexOf('if (opts.live) {'));
    expect(script).toContain('/^[A-Za-z0-9_-]{1,64}$/.test(opts.institution)');
  });
});
