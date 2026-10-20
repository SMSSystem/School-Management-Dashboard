import { describe, expect, it } from 'vitest';
import studentFormRaw from '../../components/forms/StudentForm.tsx?raw';
import teacherFormRaw from '../../components/forms/TeacherForm.tsx?raw';
import { studentDetailSource as studentPageRaw } from './studentDetailSource';
import teacherPageRaw from '../../scenes/(dashboard)/list/teachers/[id]/index.tsx?raw';
import { buildStaticGraph } from '../../../scripts/bundleGraphLogic.mjs';

// The photo rule (firestore.rules, match /users/{uid}/photo/{photoId}) reads resource.data.institutionId.
// A person with no photo has no document, so a plain getDoc of it is answered "Missing or insufficient
// permissions" for staff instead of "not found" (the owner's own photo is the exception: isOwner(uid)
// is checked first). lib/userPhoto.ts reads it with a query filtered on the institution, which the same
// rule allows and which simply returns nothing.
//
// Commit 82f9abd fixed the Students and Teachers lists. On 2026-10-17 a sweep of the production bundle
// found the same uncaught error on four more places: the Edit Student and Edit Teacher forms and the
// student and teacher detail pages. These pin the fix and fail if a getDoc of another person's photo
// comes back.

const norm = (s: string) => s.split('\r\n').join('\n');
const studentForm = norm(studentFormRaw);
const teacherForm = norm(teacherFormRaw);
const studentPage = norm(studentPageRaw);
const teacherPage = norm(teacherPageRaw);

describe('reading a person’s photo', () => {
  it('goes through the institution-filtered helper in the forms and detail pages', () => {
    expect(studentForm).toContain('fetchUserPhotoUrl(uid, institutionId)');
    expect(studentForm).toContain('}, [type, uid, institutionId]);');
    expect(teacherForm).toContain('fetchUserPhotoUrl(uid, targetInstitutionId)');
    expect(teacherForm).toContain('}, [type, uid, targetInstitutionId]);');
    expect(studentPage).toContain('fetchUserPhotoUrl(id, studentInstitutionId)');
    expect(studentPage).toContain('}, [id, studentInstitutionId]);');
    expect(teacherPage).toContain('fetchUserPhotoUrl(id, teacherInstitutionId)');
    expect(teacherPage).toContain('}, [id, teacherInstitutionId]);');
  });

  it("waits for the person's own institution on the detail pages (a super_admin's is \"*\")", () => {
    expect(studentPage).toContain('if (!id || !studentInstitutionId) return;');
    expect(teacherPage).toContain('if (!id || !teacherInstitutionId) return;');
    expect(teacherPage).toContain('setTeacherInstitutionId(typeof u.institutionId === "string" ? u.institutionId : undefined);');
  });

  it('never calls getDoc on a photo document, except the signed-in user’s own in AuthContext', () => {
    const graph = buildStaticGraph();
    const offenders: string[] = [];
    let ownReads = 0;
    for (const [file, text] of graph.files) {
      const flat = text.replace(/\s+/g, ' ');
      for (const match of flat.matchAll(/getDoc\(\s*doc\(\s*db,\s*['"]users['"],[^)]*['"]photo['"]/g)) {
        if (file === 'src/lib/AuthContext.tsx') ownReads += 1;
        else offenders.push(`${file}: ${match[0].slice(0, 90)}`);
      }
    }
    expect(ownReads, 'AuthContext reads the signed-in user’s own photo twice (sign-in and refresh)').toBe(2);
    expect(offenders, 'read another person’s photo with fetchUserPhotoUrl() from lib/userPhoto.ts instead').toEqual([]);
  });
});
