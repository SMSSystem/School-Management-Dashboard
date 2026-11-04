import { collection, doc, getDoc, getDocs, query, where, type WriteBatch } from 'firebase/firestore';
import { db } from './firebase';
import { classIdsOf, type ClassMembership } from './studentClasses';

// A parent's user document holds their children's classes in `linkedClassIds`, because a rule cannot find a parent's
// children from a lesson-note file (lessonNoteFileReadableBy in firestore.rules; ISSUES_AND_GAPS.md #66). Whatever changes
// a parent's links or a linked child's classes works out the new lists first and adds them to its own batch, so the
// change and the lists are saved together. scripts/sync-parent-linked-classes.mjs backfills the lists and repairs drift.
//
// These reads run only when a link or a child's classes actually change.

/** The classes of all of a parent's children, sorted so that the same classes always compare equal. */
export function linkedClassIdsOf(children: readonly (ClassMembership | null | undefined)[]): string[] {
  return [...new Set(children.flatMap((c) => classIdsOf(c)))].sort();
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** Whether two students' class sets are the same, in any order. */
export const sameClasses = (a: ClassMembership | null | undefined, b: ClassMembership | null | undefined): boolean =>
  sameList(linkedClassIdsOf([a]), linkedClassIdsOf([b]));

/**
 * One user of this institution, or null. The rules refuse an administrator a user who does not exist or is in another
 * institution, and a query by id is refused the same way, so a refusal means "not available here": one leftover link
 * must not fail the caller's whole save. Only an administrator can save these lists, so a refusal for any other reason
 * still fails, when the caller's batch is refused.
 */
async function userInInstitution(institutionId: string, uid: string) {
  try {
    const data = (await getDoc(doc(db, 'users', uid))).data();
    return data?.institutionId === institutionId ? data : null;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'permission-denied') return null;
    throw error;
  }
}

export type ParentClassUpdate = { parentId: string; linkedClassIds: string[] };

/** A link the caller's batch is about to add or remove, which a read would not see yet. */
export type ParentChange = { parentId: string; add?: readonly string[]; remove?: readonly string[] };

/**
 * The lists that change for these parents. `pendingClasses` holds a child whose new classes the caller's batch is about
 * to save. Only those whose list differs are returned, and a parent with no list counts as having an empty one.
 *
 * A parent or child who is missing or in another institution is left out, so a leftover link cannot fail a save. A
 * super_admin has no institution selected ('*'), so nothing is worked out for them, and the repair script covers it.
 */
export async function parentClassUpdates(
  institutionId: string | null | undefined,
  changes: readonly ParentChange[],
  pendingClasses: Readonly<Record<string, ClassMembership>> = {},
): Promise<ParentClassUpdate[]> {
  if (!institutionId || institutionId === '*') return [];
  const children = new Map<string, Promise<ClassMembership | null>>();
  const childClasses = (studentId: string) => {
    if (pendingClasses[studentId]) return Promise.resolve(pendingClasses[studentId]);
    let read = children.get(studentId);
    if (!read) {
      read = userInInstitution(institutionId, studentId) as Promise<ClassMembership | null>;
      children.set(studentId, read);
    }
    return read;
  };

  const updates = await Promise.all(
    changes.map(async ({ parentId, add = [], remove = [] }): Promise<ParentClassUpdate | null> => {
      const data = await userInInstitution(institutionId, parentId);
      if (data?.role !== 'parent') return null;
      const links = await getDocs(
        query(collection(db, 'student_parents'), where('parentId', '==', parentId), where('institutionId', '==', institutionId)),
      );
      const ids = new Set([...links.docs.map((d) => d.data().studentId as string), ...add]);
      remove.forEach((id) => ids.delete(id));
      const next = linkedClassIdsOf(await Promise.all([...ids].map(childClasses)));
      const current = Array.isArray(data.linkedClassIds) ? (data.linkedClassIds as string[]) : [];
      return sameList(current, next) ? null : { parentId, linkedClassIds: next };
    }),
  );
  return updates.filter((u): u is ParentClassUpdate => u !== null);
}

/** The lists to change because this student's classes are changing, or none if the classes stay the same. */
export async function studentClassChangeUpdates(
  institutionId: string | null | undefined,
  studentId: string,
  before: ClassMembership | null | undefined,
  after: ClassMembership,
): Promise<ParentClassUpdate[]> {
  if (!institutionId || institutionId === '*' || sameClasses(before, after)) return [];
  const links = await getDocs(
    query(collection(db, 'student_parents'), where('studentId', '==', studentId), where('institutionId', '==', institutionId)),
  );
  const changes = links.docs.map((d) => ({ parentId: d.data().parentId as string }));
  return parentClassUpdates(institutionId, changes, { [studentId]: after });
}

export function addParentClassUpdates(batch: WriteBatch, updates: readonly ParentClassUpdate[]): void {
  for (const { parentId, linkedClassIds } of updates) batch.update(doc(db, 'users', parentId), { linkedClassIds });
}
