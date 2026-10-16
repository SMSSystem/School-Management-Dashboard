import { describe, expect, it } from 'vitest';
import studentPageRaw from '../../scenes/(dashboard)/list/students/[id]/index.tsx?raw';

// The read rule for student_parents (firestore.rules) is
//   (canReadStaffData() && sameInstitution(resource.data.institutionId)) || the student or the parent themselves.
// Firestore decides a LIST query from its own filters, before it looks at any document, so a staff
// query that does not filter on institutionId is refused (permission-denied) even when every
// document it would return is readable. Only super_admin gets through without the filter.
//
// On 2026-10-16 the student detail page queried `studentId ==` alone: the "Linked Parents" list was
// always empty for an institution admin (and the dropdown kept offering a parent already linked),
// and the page has no error handler, so nothing said why. These pin the filter.

const norm = (s: string) => s.split('\r\n').join('\n');
const studentPage = norm(studentPageRaw);

describe('student detail page: linked parents query', () => {
  it("names the student's institution, so the read rule can hold for staff", () => {
    expect(studentPage).toMatch(
      /query\(\s*collection\(db, "student_parents"\),\s*where\("studentId", "==", id\),\s*where\("institutionId", "==", studentInstitutionId\),?\s*\)/,
    );
  });

  it('takes that institution from the student document and waits until it is known', () => {
    expect(studentPage).toContain('const studentInstitutionId = student?.institutionId;');
    expect(studentPage).toContain('if (!id || !studentInstitutionId) return;');
    expect(studentPage).toContain('}, [id, studentInstitutionId]);');
  });

  it('no longer queries by studentId alone', () => {
    expect(studentPage).not.toMatch(/query\(collection\(db, "student_parents"\), where\("studentId", "==", id\)\)/);
  });
});
