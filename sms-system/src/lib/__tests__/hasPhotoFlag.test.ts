import { describe, expect, it } from 'vitest';
import pagePhotosRaw from '../../hooks/usePagePhotos.ts?raw';
import { hasNoPhoto } from '../userPhotoKeys';
import studentFormRaw from '../../components/forms/StudentForm.tsx?raw';
import teacherFormRaw from '../../components/forms/TeacherForm.tsx?raw';
import createAccountRaw from '../createUserAccount.ts?raw';
import importCommitRaw from '../importStudentsCommit.ts?raw';
import studentsListRaw from '../../scenes/(dashboard)/list/students/index.tsx?raw';
import teachersListRaw from '../../scenes/(dashboard)/list/teachers/index.tsx?raw';

// The Students and Teachers lists skip the photo read for a person whose document says hasPhoto === false. The flag is
// written in the same batch as every photo write, and only an explicit false skips the read, so an account from
// before the flag is still read.

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
  ])('%s do not read the photo of a person flagged as having none (they hand their rows to the shared loader)', (_n, raw, id) => {
    expect(lf(raw)).toContain(`const rowUserId = (`);
    expect(lf(raw)).toContain(` => ${id};`);
    expect(lf(raw)).toContain('usePagePhotos(paginatedData, rowUserId, rowInstitutionId, allUsers)');
    const src = lf(pagePhotosRaw);
    expect(src).toContain('new Set((allUsers ?? []).filter(hasNoPhoto).map((u) => u.id))');
    expect(src).toContain('!noPhotoIds.has(idOf(r))');
  });

  it('an edit that changes the photo still reads it afresh, whatever the flag said', () => {
    // refreshPhoto goes straight to fetchPhoto(…, true), which does not look at the flag
    expect(lf(pagePhotosRaw)).toContain('void fetchPhoto(uid, rowInstitutionId, true);');
  });
});
