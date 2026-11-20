// A register's document id comes from what it is, so two people saving the same register at once write one document,
// and saving again can't add a second. These are the ids the seed scripts already use; the migration script
// (scripts/migrateRegisterIdsLogic.mjs) has its own copy, and a test runs both over the same values.

/** One class's register for one date and session. */
export function generalRegisterId(
  classId: string,
  date: string,
  session: string,
): string {
  return `ga_${classId}_${date}_${session}`;
}

/** One subject's register for one class and date. */
export function subjectRegisterId(
  subjectId: string,
  classId: string,
  date: string,
): string {
  return `sa_${subjectId}_${classId}_${date}`;
}

export type RegisterRecord = {
  state: string;
  reason?: string;
  studentName?: string;
};

const sameRecord = (a: RegisterRecord, b: RegisterRecord) =>
  a.state === b.state &&
  (a.reason ?? "") === (b.reason ?? "") &&
  (a.studentName ?? "") === (b.studentName ?? "");

/**
 * What a save should send: only the students it changed, and `removed` for a student who was on the saved register and
 * no longer is. Saved with `{ merge: true }`, this leaves alone a student someone else marked after this page loaded.
 */
export function registerPatch<Removed>(
  saved: Record<string, RegisterRecord> | undefined,
  next: Record<string, RegisterRecord>,
  removed: Removed,
): Record<string, RegisterRecord | Removed> {
  const patch: Record<string, RegisterRecord | Removed> = {};
  for (const [studentId, record] of Object.entries(next)) {
    const before = saved?.[studentId];
    if (!before || !sameRecord(before, record)) patch[studentId] = record;
  }
  for (const studentId of Object.keys(saved ?? {})) {
    if (!(studentId in next)) patch[studentId] = removed;
  }
  return patch;
}

/**
 * The `records` field of a merge. An empty map in a merge replaces the whole saved map, so an edit that changed nothing
 * must leave the field out. A new register sends it, so that readers always find a map.
 */
export function recordsField<T>(
  patch: Record<string, T>,
  isNewRegister: boolean,
): { records?: Record<string, T> } {
  return isNewRegister || Object.keys(patch).length > 0
    ? { records: patch }
    : {};
}
