import { describe, expect, it } from 'vitest';
import { USER_PHOTO_ROOT, userPhotoKey } from '../userPhotoKeys';
import { isPersistableQueryKey } from '../queryPersistence';
import userPhotoRaw from '../userPhoto.ts?raw';
import pagePhotosRaw from '../../hooks/usePagePhotos.ts?raw';
import studentsListRaw from '../../scenes/(dashboard)/list/students/index.tsx?raw';
import teachersListRaw from '../../scenes/(dashboard)/list/teachers/index.tsx?raw';

// List-row photos are read once and kept for the session; an upload refreshes only that row.

const lf = (s: string) => s.split('\r\n').join('\n');

describe('userPhotoKey', () => {
  it('is one key per institution and person, under its own root', () => {
    expect(userPhotoKey('i1', 'u1')).toEqual([USER_PHOTO_ROOT, 'i1', 'u1']);
    expect(userPhotoKey('i1', 'u1')).not.toEqual(userPhotoKey('i2', 'u1'));
    expect(userPhotoKey(undefined, 'u1')).toEqual([USER_PHOTO_ROOT, '', 'u1']);
  });

  it('is never persisted: a photo is personal data', () => {
    expect(isPersistableQueryKey(userPhotoKey('i1', 'u1'))).toBe(false);
  });
});

describe('the cached photo reads', () => {
  it('the cached read uses the list policy and the refresh stores what it read', () => {
    const src = lf(userPhotoRaw);
    expect(src).toContain('queryKey: userPhotoKey(institutionId, uid)');
    expect(src).toContain('staleTime: LIST_STALE_MS');
    expect(src).toContain('queryClient.setQueryData(userPhotoKey(institutionId, uid), url);');
  });

  it('the Students and Teachers lists read through the cache, and a saved photo is read afresh', () => {
    // both lists read through hooks/usePagePhotos.ts
    for (const raw of [studentsListRaw, teachersListRaw]) expect(lf(raw)).toContain('usePagePhotos(paginatedData,');
    const src = lf(pagePhotosRaw);
    expect(src).toContain('(force ? refreshUserPhotoUrl : fetchUserPhotoUrlCached)(uid, rowInstitutionId)');
    expect(src).toContain('void fetchPhoto(uid, rowInstitutionId, true);');
    expect(src).not.toContain('fetchUserPhotoUrl(uid, rowInstitutionId)');
  });

  it('a failed photo read is not remembered as "no photo": it is tried again after a pause, a few times at most', () => {
    const src = lf(pagePhotosRaw);
    expect(src).not.toContain('.catch(() => null)');
    const failure = src.slice(src.indexOf('} catch {'), src.indexOf('failedPhotoReads.current.delete(uid);'));
    expect(failure).toContain('requestedPhotoUids.current.delete(uid);');
    expect(failure).toContain('failedPhotoReads.current.set(uid,');
    expect(failure).toContain('return;');
    expect(src).toContain('const PHOTO_RETRY_AFTER_MS = 60_000;');
    expect(src).toContain('const MAX_PHOTO_TRIES = 3;');
    expect(src).toContain('failed.tries < MAX_PHOTO_TRIES && Date.now() - failed.at >= PHOTO_RETRY_AFTER_MS');
  });

  it('waits for the users list before reading any photo, so the no-photo flag is honoured on first paint', () => {
    const src = lf(pagePhotosRaw);
    expect(src).toContain('if (allUsers === undefined) return;');
    expect(src.indexOf('if (allUsers === undefined) return;')).toBeLessThan(src.indexOf('rows.filter('));
  });
});
