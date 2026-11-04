// The Firebase-free part of find-duplicate-records.mjs: which documents should be one document, how a group of
// duplicates is described, and the read budget. Nothing here writes. A report holds ids, dates and counts only:
// never names, excuse reasons, marks or a student's id (see `scopeOf`, and `logDocIds` for feedback comments, whose
// document id contains the student's id).

export const DEFAULT_MAX_READS = 5000;

/** Spark's daily read allowance, shared by the whole project. */
export const DAILY_READ_QUOTA = 50000;

const registerValue = (data) => data.records;

export const COLLECTIONS = [
  {
    name: "generalAttendance",
    fields: ["classId", "date", "session", "termId", "records"],
    keyFields: ["classId", "date", "session"],
    scopeOf: (d) => ({
      classId: d.classId,
      date: d.date,
      session: d.session,
      termId: d.termId ?? null,
    }),
    isRegister: true,
    logDocIds: true,
    valueOf: registerValue,
  },
  {
    name: "subjectAttendance",
    fields: ["subjectId", "classId", "sessionDate", "termId", "records"],
    keyFields: ["subjectId", "classId", "sessionDate"],
    scopeOf: (d) => ({
      subjectId: d.subjectId,
      classId: d.classId,
      date: d.sessionDate,
      termId: d.termId ?? null,
    }),
    isRegister: true,
    logDocIds: true,
    valueOf: registerValue,
  },
  {
    // Only results from a gradebook column have a natural key. Exam results already have fixed ids, and other
    // results can rightly repeat. The filter also means the rest are never read.
    name: "results",
    fields: ["gradebookColumnId", "studentId", "classId", "score", "maxScore"],
    keyFields: ["gradebookColumnId", "studentId"],
    where: ["gradebookColumnId", ">", ""],
    scopeOf: (d) => ({
      gradebookColumnId: d.gradebookColumnId,
      classId: d.classId ?? null,
    }),
    isRegister: false,
    logDocIds: true,
    valueOf: (d) => [d.score, d.maxScore],
  },
  {
    // The Gradebook writes these at a fixed id and the Feedback form at an automatic one, so one student can have both.
    name: "feedback_comments",
    fields: [
      "studentId",
      "subjectId",
      "termId",
      "conductGrade",
      "commentNumbers",
    ],
    keyFields: ["studentId", "subjectId", "termId"],
    scopeOf: (d) => ({ subjectId: d.subjectId, termId: d.termId }),
    isRegister: false,
    logDocIds: false,
    valueOf: (d) => [d.conductGrade ?? "", d.commentNumbers ?? []],
  },
];

/** The value that makes documents "the same record", or null when a part of it is missing. */
export function keyOf(definition, data) {
  const parts = definition.keyFields.map((field) => data[field]);
  if (parts.some((part) => typeof part !== "string" || part === ""))
    return null;
  return JSON.stringify(parts);
}

/** How a group of registers overlaps. Counts only: no student ids leave this function. */
export function registerOverlap(rows) {
  const statesByStudent = new Map();
  for (const { data } of rows) {
    const records = data.records;
    if (!records || typeof records !== "object") continue;
    for (const [studentId, record] of Object.entries(records)) {
      const states = statesByStudent.get(studentId) ?? [];
      states.push(record?.state);
      statesByStudent.set(studentId, states);
    }
  }
  let studentsInMoreThanOne = 0;
  let studentsWithDifferentMarks = 0;
  let extraMarksCounted = 0;
  for (const states of statesByStudent.values()) {
    if (states.length < 2) continue;
    studentsInMoreThanOne += 1;
    extraMarksCounted += states.length - 1;
    if (new Set(states).size > 1) studentsWithDifferentMarks += 1;
  }
  return {
    studentsInMoreThanOne,
    studentsWithDifferentMarks,
    extraMarksCounted,
  };
}

/** Groups one collection's rows ({ id, data }) and describes each group of two or more. */
export function findDuplicates(definition, rows) {
  const groups = new Map();
  let skipped = 0;
  for (const row of rows) {
    const key = keyOf(definition, row.data);
    if (key === null) {
      skipped += 1;
      continue;
    }
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const duplicates = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const values = new Set(
      group.map((row) => JSON.stringify(definition.valueOf(row.data) ?? null)),
    );
    duplicates.push({
      ...definition.scopeOf(group[0].data),
      documents: group.length,
      valuesDiffer: values.size > 1,
      ...(definition.logDocIds
        ? { documentIds: group.map((row) => row.id) }
        : {}),
      ...(definition.isRegister ? registerOverlap(group) : {}),
    });
  }
  return { scanned: rows.length, skipped, duplicates };
}

/** The total for one collection's report: what a person reads first. */
export function summarise({ scanned, skipped, duplicates }) {
  return {
    scanned,
    skipped,
    groups: duplicates.length,
    extraDocuments: duplicates.reduce(
      (sum, group) => sum + group.documents - 1,
      0,
    ),
    groupsThatDiffer: duplicates.filter((group) => group.valuesDiffer).length,
    extraMarksCounted: duplicates.reduce(
      (sum, group) => sum + (group.extraMarksCounted ?? 0),
      0,
    ),
  };
}

/** Whether reading this many documents is allowed. */
export function checkBudget(totalDocuments, maxReads) {
  return {
    totalDocuments,
    maxReads,
    allowed: totalDocuments <= maxReads,
    shareOfDailyQuota: totalDocuments / DAILY_READ_QUOTA,
  };
}

/** The query for one collection under an institution. Reads only the fields the report needs. */
export function queryFor(institutionRef, definition) {
  let query = institutionRef.collection(definition.name);
  if (definition.where) query = query.where(...definition.where);
  return query;
}

/** How many documents a scan would read. Each count costs about one read per 1,000 documents. */
export async function countCollection(institutionRef, definition) {
  const snapshot = await queryFor(institutionRef, definition).count().get();
  return snapshot.data().count;
}

/** Reads one collection and finds its duplicates. */
export async function scanCollection(institutionRef, definition) {
  const snapshot = await queryFor(institutionRef, definition)
    .select(...definition.fields)
    .get();
  const rows = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  return findDuplicates(definition, rows);
}
