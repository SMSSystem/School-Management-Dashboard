import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Role } from "@/types/people";
import { institutionCollection, institutionDoc, institutionSubcollection } from "@/lib/paths";
import { leadTeacher } from "@/lib/subjectTeachers";
import type { RowError } from "@/lib/spreadsheetImport";
import { TARGET_COLLECTION, duplicateKeyFor, type Row } from "@/lib/importConfig";
import type {
  ResultsIdentityCandidates,
  ResultWriteContext,
} from "@/lib/importResults";
import type { MddsIdentityCandidates, MddsWriteContext } from "@/lib/importMdds";
import type { GradebookColumnInfo, GradebookTargetContext, GradebookWriteContext } from "@/lib/importGradebook";
import type { GeneralAttendanceIdentityCandidates, ClassTermInfo, GeneralAttendanceGroup } from "@/lib/importGeneralAttendance";
import type { SubjectAttendanceIdentityCandidates, SubjectAttendanceGroup } from "@/lib/importSubjectAttendance";
import type { StudentsIdentityCandidates, ResolvedStudentImportRow } from "@/lib/importStudents";

// The Import page's reads against Firestore (scenes/(dashboard)/import), kept out of the target modules on
// purpose (see those files' module comments): who and what a spreadsheet's names can be matched to, what
// already exists to merge into or clash with, and the uniqueness pre-check for imported students.

export async function fetchNameCandidates(refFn: () => ReturnType<typeof institutionCollection> | ReturnType<typeof query>) {
  const snap = await getDocs(refFn());
  return snap.docs.map((d) => ({ id: d.id, name: ((d.data() as Record<string, unknown>).name as string) ?? "" }));
}

export async function fetchAssignedClassId(uid: string): Promise<string | undefined> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data().assignedClassId as string | undefined) : undefined;
}

export async function fetchCandidatesFor(
  target: "results" | "mdds",
  institutionId: string,
  role: Role,
  uid: string,
): Promise<ResultsIdentityCandidates | MddsIdentityCandidates> {
  const students = await fetchNameCandidates(() =>
    query(collection(db, "users"), where("role", "==", "student"), where("institutionId", "==", institutionId)),
  );
  const classes = await fetchNameCandidates(() => institutionCollection(institutionId, "classes"));
  const terms = await fetchNameCandidates(() => institutionCollection(institutionId, "terms"));

  if (target === "mdds") {
    return { students, classes, terms };
  }

  // Mirrors ResultForm.tsx: a regular_teacher only sees their own subjects.
  const subjects = await fetchNameCandidates(() =>
    role === "regular_teacher"
      ? query(institutionCollection(institutionId, "subjects"), where("teacherIds", "array-contains", uid))
      : institutionCollection(institutionId, "subjects"),
  );
  return { students, classes, subjects, terms };
}

export async function fetchWriteContextFor(
  target: "results" | "mdds",
  institutionId: string,
  uid: string,
  displayName: string | null,
  role: Role,
): Promise<ResultWriteContext | MddsWriteContext> {
  if (target === "mdds") {
    return { institutionId, issuedBy: uid, issuedByName: displayName ?? "", issuedByRole: role };
  }
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : {};
  return {
    institutionId,
    teacherId: uid,
    teacherName: (data.name as string) ?? "",
    departmentId: (data.departmentId as string) ?? "",
  };
}

/** §19.3 — scoped to the terms actually referenced in this import, not the whole collection's history. Doesn't apply to Gradebook or General Attendance — §19.3 names Results/MDDS specifically, and both other targets' create-vs-update logic already handles what would otherwise be a "duplicate." */
export async function fetchExistingKeysFor(target: "results" | "mdds", institutionId: string, termIds: string[]): Promise<Set<string>> {
  if (termIds.length === 0) return new Set();
  const snap = await getDocs(
    query(institutionCollection(institutionId, TARGET_COLLECTION[target]), where("termId", "in", termIds.slice(0, 30))),
  );
  return new Set(snap.docs.map((d) => duplicateKeyFor(target, d.data() as Row)));
}

/** Gradebook's setup-step candidate lists — see module comment. */
export async function fetchGradebookSetupOptions(institutionId: string, role: Role, uid: string) {
  const classes = await fetchNameCandidates(() => institutionCollection(institutionId, "classes"));
  const terms = await fetchNameCandidates(() => institutionCollection(institutionId, "terms"));
  const subjects = await fetchNameCandidates(() =>
    role === "regular_teacher" || role === "senior_teacher"
      ? query(institutionCollection(institutionId, "subjects"), where("teacherIds", "array-contains", uid))
      : institutionCollection(institutionId, "subjects"),
  );
  return { classes, subjects, terms };
}

/** General Attendance candidates — a senior_teacher only sees their own assigned homeroom class (firestore.rules only lets them write that one); an admin sees every class. Students are unscoped, same as Results/MDDS. */
export async function fetchGeneralAttendanceCandidates(
  institutionId: string,
  role: Role,
  uid: string,
): Promise<GeneralAttendanceIdentityCandidates> {
  const students = await fetchNameCandidates(() =>
    query(collection(db, "users"), where("role", "==", "student"), where("institutionId", "==", institutionId)),
  );
  let classes = await fetchNameCandidates(() => institutionCollection(institutionId, "classes"));
  if (role === "senior_teacher") {
    const assignedClassId = await fetchAssignedClassId(uid);
    classes = assignedClassId ? classes.filter((c) => c.id === assignedClassId) : [];
  }
  return { classes, students };
}

/** §9: a class's term is its own fixed ClassDocument.termId, not looked up per date — this just resolves that id to the term's actual date range/academicYearId so validateGeneralAttendanceDates can check consistency. */
export async function fetchClassTermInfo(institutionId: string, classIds: string[]): Promise<Map<string, ClassTermInfo>> {
  const classDocs = await Promise.all(classIds.map((id) => getDoc(institutionDoc(institutionId, "classes", id))));
  const termIdByClass = new Map<string, string>();
  classDocs.forEach((snap) => {
    if (!snap.exists()) return;
    const termId = (snap.data() as Record<string, unknown>).termId as string | undefined;
    if (termId) termIdByClass.set(snap.id, termId);
  });

  const distinctTermIds = Array.from(new Set(termIdByClass.values()));
  const termDocs = await Promise.all(distinctTermIds.map((id) => getDoc(institutionDoc(institutionId, "terms", id))));
  const infoByTermId = new Map<string, ClassTermInfo>();
  termDocs.forEach((snap) => {
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    infoByTermId.set(snap.id, {
      termId: snap.id,
      academicYearId: (data.academicYearId as string) ?? "",
      termStartDate: (data.startDate as string) ?? "",
      termEndDate: (data.endDate as string) ?? "",
    });
  });

  const result = new Map<string, ClassTermInfo>();
  termIdByClass.forEach((termId, classId) => {
    const info = infoByTermId.get(termId);
    if (info) result.set(classId, info);
  });
  return result;
}

/** Existing generalAttendance docs to merge into, one query per distinct class scoped to that class's date range in this import — matches the classId+date composite index already deployed. */
export async function fetchExistingGeneralAttendanceDocs(
  institutionId: string,
  groups: GeneralAttendanceGroup[],
): Promise<Map<string, string>> {
  const rangeByClass = new Map<string, { minDate: string; maxDate: string }>();
  groups.forEach((g) => {
    const cur = rangeByClass.get(g.classId);
    if (!cur) rangeByClass.set(g.classId, { minDate: g.date, maxDate: g.date });
    else {
      if (g.date < cur.minDate) cur.minDate = g.date;
      if (g.date > cur.maxDate) cur.maxDate = g.date;
    }
  });

  const existingMap = new Map<string, string>();
  await Promise.all(
    Array.from(rangeByClass.entries()).map(async ([classId, { minDate, maxDate }]) => {
      const snap = await getDocs(
        query(
          institutionCollection(institutionId, "generalAttendance"),
          where("classId", "==", classId),
          where("date", ">=", minDate),
          where("date", "<=", maxDate),
        ),
      );
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        existingMap.set(`${classId}::${data.date as string}::${data.session as string}`, d.id);
      });
    }),
  );
  return existingMap;
}

/** Subject Attendance candidates — mirrors ResultForm.tsx's regular_teacher subject scoping; senior_teacher never reaches this target (excluded at TARGET_ALLOWED_ROLES). Classes/students are unscoped. */
export async function fetchSubjectAttendanceCandidates(
  institutionId: string,
  role: Role,
  uid: string,
): Promise<SubjectAttendanceIdentityCandidates> {
  const students = await fetchNameCandidates(() =>
    query(collection(db, "users"), where("role", "==", "student"), where("institutionId", "==", institutionId)),
  );
  const classes = await fetchNameCandidates(() => institutionCollection(institutionId, "classes"));
  const subjects = await fetchNameCandidates(() =>
    role === "regular_teacher"
      ? query(institutionCollection(institutionId, "subjects"), where("teacherIds", "array-contains", uid))
      : institutionCollection(institutionId, "subjects"),
  );
  return { subjects, classes, students };
}

/** Existing subjectAttendance docs to merge into, one query per distinct (subjectId, classId) pair scoped to that pair's date range — matches the subjectId+classId+sessionDate composite index already deployed. */
export async function fetchExistingSubjectAttendanceDocs(
  institutionId: string,
  groups: SubjectAttendanceGroup[],
): Promise<Map<string, string>> {
  const rangeByPair = new Map<string, { subjectId: string; classId: string; minDate: string; maxDate: string }>();
  groups.forEach((g) => {
    const key = `${g.subjectId}::${g.classId}`;
    const cur = rangeByPair.get(key);
    if (!cur) rangeByPair.set(key, { subjectId: g.subjectId, classId: g.classId, minDate: g.sessionDate, maxDate: g.sessionDate });
    else {
      if (g.sessionDate < cur.minDate) cur.minDate = g.sessionDate;
      if (g.sessionDate > cur.maxDate) cur.maxDate = g.sessionDate;
    }
  });

  const existingMap = new Map<string, string>();
  await Promise.all(
    Array.from(rangeByPair.values()).map(async ({ subjectId, classId, minDate, maxDate }) => {
      const snap = await getDocs(
        query(
          institutionCollection(institutionId, "subjectAttendance"),
          where("subjectId", "==", subjectId),
          where("classId", "==", classId),
          where("sessionDate", ">=", minDate),
          where("sessionDate", "<=", maxDate),
        ),
      );
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        existingMap.set(`${subjectId}::${classId}::${data.sessionDate as string}`, d.id);
      });
    }),
  );
  return existingMap;
}

/** Students candidates — Class/House only, unlike every other target. No "students" candidate list: there's no existing-student column to resolve against, since every row creates a new one. */
export async function fetchStudentsCandidates(institutionId: string): Promise<StudentsIdentityCandidates> {
  const classes = await fetchNameCandidates(() => institutionCollection(institutionId, "classes"));
  const houses = await fetchNameCandidates(() => institutionCollection(institutionId, "houses"));
  return { classes, houses };
}

/**
 * Batched pre-write uniqueness check for institutionStudentId/idNumber,
 * mirroring AdminCreateUserForm.tsx's own per-submit checks but done once
 * for the whole file rather than once per account — cheaper, and fails
 * fast before spending any of the 90-row/hour Auth-creation budget on a
 * row that would just error anyway. Two kinds of conflict: two rows in
 * this same file sharing a value (a mistake no Firestore query can catch),
 * and a row colliding with an already-existing account. institutionStudentId
 * is scoped to role=='student' (matching AdminCreateUserForm.tsx exactly);
 * idNumber is scoped by institution only, no role filter, since it applies
 * to every role there too. `in` queries chunked to 30 — Firestore's limit,
 * same precedent as fetchExistingKeysFor's termId lookups.
 *
 * CORRECTED (code review before opening the PR): this originally claimed no
 * composite index was needed here, reasoning from AdminCreateUserForm.tsx's
 * equivalent check — but that precedent is 3x `==` with no `in`, a
 * different shape. Both queries below need their own composite index;
 * they're in firestore.indexes.json (users: institutionId+role+
 * institutionStudentId, and users: institutionId+idNumber) and have been
 * deployed via `firebase deploy --only firestore:indexes`.
 */
export async function fetchStudentsUniquenessConflicts(
  institutionId: string,
  rows: { row: ResolvedStudentImportRow; rowNumber: number }[],
): Promise<RowError[]> {
  const errors: RowError[] = [];

  const seenStudentIds = new Map<string, number>();
  const seenIdNumbers = new Map<string, number>();
  for (const { row, rowNumber } of rows) {
    if (row.institutionStudentId) {
      if (seenStudentIds.has(row.institutionStudentId)) {
        errors.push({ row: rowNumber, message: `Student ID "${row.institutionStudentId}" is used by more than one row in this file.` });
      } else {
        seenStudentIds.set(row.institutionStudentId, rowNumber);
      }
    }
    if (row.idNumber) {
      if (seenIdNumbers.has(row.idNumber)) {
        errors.push({ row: rowNumber, message: `Citizen ID or TRN "${row.idNumber}" is used by more than one row in this file.` });
      } else {
        seenIdNumbers.set(row.idNumber, rowNumber);
      }
    }
  }

  const studentIds = Array.from(seenStudentIds.keys());
  if (studentIds.length > 0) {
    const conflicting = new Set<string>();
    for (let i = 0; i < studentIds.length; i += 30) {
      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("institutionId", "==", institutionId),
          where("role", "==", "student"),
          where("institutionStudentId", "in", studentIds.slice(i, i + 30)),
        ),
      );
      snap.docs.forEach((d) => conflicting.add(d.data().institutionStudentId as string));
    }
    rows.forEach(({ row, rowNumber }) => {
      if (row.institutionStudentId && conflicting.has(row.institutionStudentId)) {
        errors.push({ row: rowNumber, message: `Student ID "${row.institutionStudentId}" is already in use.` });
      }
    });
  }

  const idNumbers = Array.from(seenIdNumbers.keys());
  if (idNumbers.length > 0) {
    const conflicting = new Set<string>();
    for (let i = 0; i < idNumbers.length; i += 30) {
      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("institutionId", "==", institutionId),
          where("idNumber", "in", idNumbers.slice(i, i + 30)),
        ),
      );
      snap.docs.forEach((d) => conflicting.add(d.data().idNumber as string));
    }
    rows.forEach(({ row, rowNumber }) => {
      if (row.idNumber && conflicting.has(row.idNumber)) {
        errors.push({ row: rowNumber, message: `Citizen ID or TRN "${row.idNumber}" is already in use.` });
      }
    });
  }

  return errors;
}

/**
 * The gradebook's columns (null when it has none yet), the subject's lead teacher and department, and the
 * two contexts an import into this gradebook needs: what the file's rows are checked against, and what
 * its writes are stamped with.
 */
export async function fetchGradebookSetup(
  institutionId: string,
  gradebookId: string,
  pick: {
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    termId: string;
    termName: string;
    teacherUid: string;
  },
) {
  const columnsSnap = await getDocs(institutionSubcollection(institutionId, "gradebooks", gradebookId, "columns"));
  if (columnsSnap.empty) return null;
  const columnsById = new Map<string, GradebookColumnInfo>();
  const columnCandidates: { id: string; name: string }[] = [];
  columnsSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const info: GradebookColumnInfo = {
      id: d.id,
      label: (data.label as string) ?? "",
      maxScore: (data.maxScore as number) ?? 0,
      columnWeight: (data.columnWeight as number) ?? 0,
      assessmentType: (data.assessmentType as "coursework" | "exam") ?? "coursework",
      date: data.date as string | undefined,
    };
    columnsById.set(d.id, info);
    columnCandidates.push({ id: d.id, name: info.label });
  });

  const subjectSnap = await getDoc(institutionDoc(institutionId, "subjects", pick.subjectId));
  const subjectData = subjectSnap.exists() ? (subjectSnap.data() as Record<string, unknown>) : {};
  const leadName = leadTeacher({
    teacherIds: subjectData.teacherIds as string[] | undefined,
    teacherNames: subjectData.teacherNames as string[] | undefined,
    assistantTeacherId: subjectData.assistantTeacherId as string | undefined,
  })?.name;

  const context: GradebookTargetContext = {
    classId: pick.classId,
    className: pick.className,
    subjectId: pick.subjectId,
    subjectName: pick.subjectName,
    termId: pick.termId,
    termName: pick.termName,
  };
  const writeContext: GradebookWriteContext = {
    institutionId,
    classId: pick.classId,
    className: pick.className,
    subjectId: pick.subjectId,
    termId: pick.termId,
    teacherId: pick.teacherUid,
    teacherName: leadName ?? "",
    departmentId: (subjectData.departmentId as string) ?? "",
  };
  return { columnsById, columnCandidates, context, writeContext };
}

/** The students whose HOME class is the gradebook's class: an import follows the register, the home class. */
export async function fetchGradebookStudentCandidates(institutionId: string, classId: string) {
  return fetchNameCandidates(() =>
    query(
      collection(db, "users"),
      where("role", "==", "student"),
      where("institutionId", "==", institutionId),
      where("classId", "==", classId),
    ),
  );
}

/** This gradebook's existing results, by student and column, so a row updates one instead of adding a second. */
export async function fetchGradebookExistingResults(
  institutionId: string,
  classId: string,
  subjectId: string,
  termId: string,
): Promise<Map<string, string>> {
  const existingSnap = await getDocs(
    query(
      institutionCollection(institutionId, "results"),
      where("classId", "==", classId),
      where("subjectId", "==", subjectId),
      where("termId", "==", termId),
    ),
  );
  const existingMap = new Map<string, string>();
  existingSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (data.gradebookColumnId && data.studentId) {
      existingMap.set(`${data.studentId as string}::${data.gradebookColumnId as string}`, d.id);
    }
  });
  return existingMap;
}
