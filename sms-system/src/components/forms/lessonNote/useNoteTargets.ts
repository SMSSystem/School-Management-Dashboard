import { useMemo, useState } from "react";
import { noteClassIds, noteClassNames, type NoteClassFields } from "@/lib/lessonNoteClasses";
import {
  MAX_LESSON_NOTE_SUBJECTS,
  noteSubjectIds,
  noteSubjectNames,
} from "@/lib/lessonNoteSubjects";
import { classesTaughtBy, classOptionsForSubjects, subjectsTaughtBy, type TeachableSubject } from "@/lib/teacherScope";

type Named = { id: string; name: string };

// The subjects and classes a lesson note is for, as the form picks them. A teacher is offered only what they
// teach (UI-level, Gradebook precedent); an administrator everything. The classes offered follow the subjects
// ticked: the classes where the teacher teaches any of them (every taught class when none is ticked). Ticking or
// unticking a subject drops the ticked classes that are no longer offered. A note's own subjects and classes stay
// selectable even when the editor does not teach them (a senior teacher editing a colleague's note), so opening the
// form never blanks them.
export function useNoteTargets<S extends Named & TeachableSubject, C extends Named>({
  note,
  rawSubjects,
  allClasses,
  uid,
  isTeacherRole,
}: {
  note: NoteClassFields & { subjectName?: string | null } | undefined;
  rawSubjects: S[];
  allClasses: C[];
  uid: string | undefined;
  isTeacherRole: boolean;
}) {
  const taughtSubjects = useMemo(
    () => (isTeacherRole && uid ? subjectsTaughtBy(rawSubjects, uid) : rawSubjects),
    [isTeacherRole, uid, rawSubjects],
  );
  const taughtClasses = useMemo(
    () => (isTeacherRole && uid ? classesTaughtBy(allClasses, rawSubjects, uid) : allClasses),
    [isTeacherRole, uid, allClasses, rawSubjects],
  );

  const existingSubjects = useMemo(() => {
    const names = noteSubjectNames(note ?? {});
    return noteSubjectIds(note ?? {}).map((id, i) => ({ id, name: names[i] ?? "Current subject" }));
  }, [note]);
  const existingClasses = useMemo(() => {
    const names = noteClassNames(note ?? {});
    return noteClassIds(note ?? {}).map((id, i) => ({ id, name: names[i] ?? "Current class" }));
  }, [note]);

  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>(() => existingSubjects.map((s) => s.id));
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(() => existingClasses.map((c) => c.id));

  const chosenSubjects = rawSubjects.filter((s) => selectedSubjectIds.includes(s.id));
  const classOptions = classOptionsForSubjects(chosenSubjects, taughtClasses);

  const subjectChoices = useMemo(() => {
    const list: Named[] = [...taughtSubjects];
    for (const s of existingSubjects) if (!list.some((x) => x.id === s.id)) list.push(s);
    return list;
  }, [taughtSubjects, existingSubjects]);
  const classChoices = useMemo(() => {
    const list: Named[] = [...classOptions];
    for (const c of existingClasses) if (!list.some((x) => x.id === c.id)) list.push(c);
    return list;
  }, [classOptions, existingClasses]);

  const toggleClass = (id: string) =>
    setSelectedClassIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleSubject = (id: string) => {
    const next = selectedSubjectIds.includes(id)
      ? selectedSubjectIds.filter((x) => x !== id)
      : selectedSubjectIds.length < MAX_LESSON_NOTE_SUBJECTS
        ? [...selectedSubjectIds, id]
        : selectedSubjectIds;
    if (next === selectedSubjectIds) return;
    setSelectedSubjectIds(next);
    const allowed = new Set(
      classOptionsForSubjects(
        rawSubjects.filter((s) => next.includes(s.id)),
        taughtClasses,
      ).map((c) => c.id),
    );
    setSelectedClassIds((prev) => prev.filter((cid) => allowed.has(cid)));
  };

  return {
    subjectChoices,
    classChoices,
    selectedSubjectIds,
    selectedClassIds,
    toggleSubject,
    toggleClass,
    // The ticked ones in the order the lists show them: the first becomes the note's subjectId / classId.
    pickedSubjects: subjectChoices.filter((s) => selectedSubjectIds.includes(s.id)),
    pickedClasses: classChoices.filter((c) => selectedClassIds.includes(c.id)),
    subjectsAtLimit: selectedSubjectIds.length >= MAX_LESSON_NOTE_SUBJECTS,
  };
}
