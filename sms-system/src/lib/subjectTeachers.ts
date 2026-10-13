// A subject's teachers and its optional assistant teacher.
//
// A subject keeps its teachers as two index-aligned arrays (teacherIds / teacherNames),
// and every teacher on it has the same access (firestore.rules and the role-scoped
// queries only look at teacherIds). The assistant is therefore just a LABEL on one of
// those teachers: assistantTeacherId must be one of teacherIds, so no rule or query
// changes and the assistant can do everything the other teachers can. The only thing
// the label changes is who is named as THE teacher on a report: the lead teacher is
// the first teacher who is not the assistant.

export type SubjectTeachers = {
  teacherIds?: string[];
  teacherNames?: string[];
  assistantTeacherId?: string;
  assistantTeacherName?: string;
};

export type SubjectTeacher = { id: string; name: string };

/** The subject's teachers in order, each with a name (the id when no name is stored). */
export function subjectTeacherList(s: SubjectTeachers): SubjectTeacher[] {
  return (s.teacherIds ?? []).map((id, i) => ({ id, name: s.teacherNames?.[i] ?? id }));
}

/** The assistant, only if it is still one of the subject's teachers. */
export function assistantOf(s: SubjectTeachers): SubjectTeacher | null {
  if (!s.assistantTeacherId) return null;
  return subjectTeacherList(s).find((t) => t.id === s.assistantTeacherId) ?? null;
}

/** The teachers who are not the assistant, in order. */
export function leadTeachers(s: SubjectTeachers): SubjectTeacher[] {
  const assistant = assistantOf(s);
  return subjectTeacherList(s).filter((t) => t.id !== assistant?.id);
}

/**
 * The teacher named on reports: the first teacher who is not the assistant. When the
 * assistant is the only teacher it is named (better than a blank). Null when there are none.
 */
export function leadTeacher(s: SubjectTeachers): SubjectTeacher | null {
  return leadTeachers(s)[0] ?? subjectTeacherList(s)[0] ?? null;
}

/**
 * Tick or untick one teacher in both aligned arrays by id (the old form matched the
 * name for the names array, which breaks for two teachers with the same name).
 */
export function toggleTeacherLists(
  ids: readonly string[],
  names: readonly string[],
  id: string,
  name: string,
): { ids: string[]; names: string[] } {
  const at = ids.indexOf(id);
  if (at === -1) return { ids: [...ids, id], names: [...names, name] };
  return { ids: ids.filter((_, i) => i !== at), names: names.filter((_, i) => i !== at) };
}

/**
 * The assistant fields to store: the chosen assistant if it is one of the teachers,
 * else none. `undefined` values mean "no assistant" (the form deletes the fields).
 */
export function assistantFields(
  teacherIds: readonly string[],
  teacherNames: readonly string[],
  assistantId: string | null | undefined,
): { assistantTeacherId: string; assistantTeacherName: string } | null {
  if (!assistantId) return null;
  const at = teacherIds.indexOf(assistantId);
  if (at === -1) return null;
  return { assistantTeacherId: assistantId, assistantTeacherName: teacherNames[at] ?? assistantId };
}

/**
 * The subject's teachers once `uid` is taken off it: both aligned arrays without that
 * teacher, and whether the assistant label must go too (the teacher was the assistant).
 */
export function withoutTeacher(
  s: SubjectTeachers,
  uid: string,
): { teacherIds: string[]; teacherNames: string[]; clearAssistant: boolean } {
  const ids = s.teacherIds ?? [];
  const names = s.teacherNames ?? [];
  return {
    teacherIds: ids.filter((id) => id !== uid),
    teacherNames: names.filter((_, i) => ids[i] !== uid),
    clearAssistant: s.assistantTeacherId === uid,
  };
}

/** "Ann Lee, Bo Chan (Assistant)": the teachers' names, the assistant tagged. */
export function formatSubjectTeachers(s: SubjectTeachers): string {
  const assistant = assistantOf(s);
  return subjectTeacherList(s)
    .map((t) => (t.id === assistant?.id ? `${t.name} (Assistant)` : t.name))
    .join(', ');
}
