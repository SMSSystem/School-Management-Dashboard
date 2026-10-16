import { describe, expect, it } from 'vitest';
import studentPageRaw from '../../scenes/(dashboard)/list/students/[id]/index.tsx?raw';
import parentFormRaw from '../../components/forms/ParentForm.tsx?raw';
import { buildStaticGraph } from '../../../scripts/bundleGraphLogic.mjs';

// The read rule for student_parents (firestore.rules) is
//   (canReadStaffData() && sameInstitution(resource.data.institutionId)) || the student or the parent themselves.
// Firestore decides a LIST query from its own filters, before it looks at any document, so a staff
// query that does not filter on institutionId is refused (permission-denied) even when every
// document it would return is readable. Only super_admin gets through without the filter.
//
// On 2026-10-16 two places queried that way: the student detail page (`studentId ==` alone: the
// "Linked Parents" list was always empty for an institution admin, and the dropdown kept offering a
// parent already linked) and the Edit Parent form (`parentId ==` alone: the links never loaded, and
// Save returns without saving until they have). Neither has an error handler, so nothing said why.
// These pin the filters and fail if another student_parents query goes the same way.

const norm = (s: string) => s.split('\r\n').join('\n');
const studentPage = norm(studentPageRaw);
const parentForm = norm(parentFormRaw);

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

describe('parent edit form: linked students query', () => {
  it("names the parent's institution, except for a row with none (the '*' sentinel, which super_admin may query unfiltered)", () => {
    expect(parentForm).toContain('const filters = [where("parentId", "==", uid)];');
    expect(parentForm).toContain('if (targetInstitutionId && targetInstitutionId !== "*") {');
    expect(parentForm).toContain('filters.push(where("institutionId", "==", targetInstitutionId));');
    expect(parentForm).toContain('getDocs(query(collection(db, "student_parents"), ...filters))');
  });

  it('loads again if the parent institution changes', () => {
    expect(parentForm).toContain('}, [data?.uid, targetInstitutionId]);');
  });
});

describe('every student_parents query in the app', () => {
  it("is the signed-in parent's own (parentId == their uid) or names the institution", () => {
    const graph = buildStaticGraph();
    const refused: string[] = [];
    let found = 0;
    for (const [file, text] of graph.files) {
      const flat = text.replace(/\s+/g, ' ');
      for (const match of flat.matchAll(/collection\(db, ['"]student_parents['"]\)/g)) {
        found += 1;
        const at = match.index ?? 0;
        const near = flat.slice(Math.max(0, at - 220), at + 280);
        const ownLinks = /where\(['"]parentId['"], ['"]==['"], user!?\.uid\)/.test(near);
        const namesInstitution = /where\(['"]institutionId['"]/.test(near);
        if (!ownLinks && !namesInstitution) refused.push(file);
      }
    }
    expect(found, 'the scan should find the app\'s student_parents queries').toBeGreaterThan(8);
    expect(refused, 'add where("institutionId", "==", ...) to these queries (see the comment at the top of this file)').toEqual([]);
  });
});
