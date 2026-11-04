// Pure decisions for scripts/sync-parent-linked-classes.mjs (no I/O, so they can be unit tested from
// src/lib/__tests__/syncParentLinkedClasses.test.ts). The lists must match linkedClassIdsOf() in
// src/lib/parentLinkedClasses.ts, which that test checks.

const text = (v) => (typeof v === 'string' ? v : '');

/** Every class of a student, as classIdsOf() in src/lib/studentClasses.ts reads them. */
function classesOf(student) {
  const home = text(student.classId);
  const stored = Array.isArray(student.classIds) ? student.classIds.map(text).filter(Boolean) : [];
  return [...(home ? [home] : []), ...stored];
}

/** The classes of all these children, sorted and without repeats. */
export function linkedClassList(children) {
  return [...new Set(children.flatMap(classesOf))].sort();
}

const sameList = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * What to change, and counts for the report.
 *
 * A link counts when its student exists and is in the parent's institution. A link's own institutionId is not used: the
 * screens find a parent's children by parentId, and a link saved by a super_admin may not carry the right one. A parent
 * with no list counts as having an empty one, which the rule treats the same.
 *
 * @param parents  [{ id, institutionId, linkedClassIds }]
 * @param students [{ id, institutionId, classId, classIds }]
 * @param links    [{ parentId, studentId }]
 */
export function planParentLists({ parents, students, links }) {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const childrenOf = new Map();
  const report = { parentsChecked: parents.length, toChange: 0, alreadyRight: 0, noChildren: 0, linksToMissingParent: 0, linksToMissingStudent: 0, linksAcrossInstitutions: 0 };

  for (const { parentId, studentId } of links) {
    const parent = parentById.get(parentId);
    const student = studentById.get(studentId);
    if (!parent) report.linksToMissingParent++;
    if (!student) report.linksToMissingStudent++;
    if (!parent || !student) continue;
    if (student.institutionId !== parent.institutionId) {
      report.linksAcrossInstitutions++;
      continue;
    }
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId).push(student);
  }

  const changes = [];
  for (const parent of parents) {
    const children = childrenOf.get(parent.id) ?? [];
    if (children.length === 0) report.noChildren++;
    const next = linkedClassList(children);
    const current = Array.isArray(parent.linkedClassIds) ? parent.linkedClassIds : [];
    if (sameList(current, next)) report.alreadyRight++;
    else {
      report.toChange++;
      changes.push({ parentId: parent.id, linkedClassIds: next });
    }
  }
  return { changes, report };
}
