import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  deleteField,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  INST,
  as,
  assertFails,
  assertSucceeds,
  resetAndSeedUsers,
  seedDoc,
  startEnv,
  stopEnv,
} from "./helpers";

// Scoring a grade with the rubric (src/lib/rubricScoring.ts, src/lib/grading.ts): the grader writes rubricScores,
// rubricTotal and rubricMax with the grade, all three or none, at most 50 scores, and a total from 0 to the max. A
// re-grade may remove them, and the feedback. The student can't write them. The assignment belongs to teacherA.

const AID = "assignScores";
const path = `institutions/${INST}/assignments/${AID}`;
const subPath = `${path}/submissions/studentA`;
const now = Timestamp.now();

const assignment = {
  institutionId: INST,
  title: "Essay",
  type: "homework",
  status: "published",
  classId: "classA",
  teacherId: "teacherA",
  teacherRole: "regular_teacher",
  departmentId: "dept1",
  dueDate: "2026-12-01",
  dueDateTimestamp: now,
  gradingMode: "standalone",
  rubricId: "rub1",
};
const submission = {
  institutionId: INST,
  assignmentId: AID,
  studentId: "studentA",
  status: "submitted",
};
const scores = [
  { criterionId: "c1", points: 4, level: "Good" },
  { criterionId: "c2", points: 2.5 },
];
const grade = (over: Record<string, unknown> = {}) => ({
  grade: 6.5,
  maxGrade: 8,
  gradedBy: "teacherA",
  gradedByName: "A",
  gradedAt: serverTimestamp(),
  status: "graded",
  rubricScores: scores,
  rubricTotal: 6.5,
  rubricMax: 8,
  ...over,
});

describe("rubric scores on a graded submission", () => {
  beforeAll(startEnv);
  afterAll(stopEnv);
  beforeEach(async () => {
    await resetAndSeedUsers();
    await seedDoc(path, assignment);
    await seedDoc(subPath, submission);
  });

  it("lets the assignment's teacher, a senior teacher of the department and an admin save them with the grade", async () => {
    for (const uid of ["teacherA", "seniorSame", "admin"]) {
      await seedDoc(subPath, submission);
      await assertSucceeds(updateDoc(doc(as(uid), subPath), grade()));
    }
  });

  it("refuses some of the three without the others", async () => {
    const db = as("teacherA");
    await assertFails(
      updateDoc(doc(db, subPath), grade({ rubricTotal: deleteField() })),
    );
    await assertFails(
      updateDoc(doc(db, subPath), grade({ rubricMax: deleteField() })),
    );
    await assertFails(
      updateDoc(
        doc(db, subPath),
        grade({ rubricScores: deleteField(), rubricMax: deleteField() }),
      ),
    );
  });

  it("refuses a total over the max, a negative total, a zero max, no scores and more than 50", async () => {
    const db = as("teacherA");
    const many = Array.from({ length: 51 }, (_, i) => ({
      criterionId: `c${i}`,
      points: 0,
    }));
    for (const over of [
      { rubricTotal: 9 },
      { rubricTotal: -1 },
      { rubricMax: 0, rubricTotal: 0 },
      { rubricTotal: "6.5" },
      { rubricScores: [] },
      { rubricScores: "c1" },
      { rubricScores: many },
    ]) {
      await assertFails(updateDoc(doc(db, subPath), grade(over)));
    }
  });

  it("lets a re-grade remove the scores and the feedback", async () => {
    await seedDoc(subPath, {
      ...submission,
      grade: 6.5,
      maxGrade: 8,
      feedback: "Good work",
      rubricScores: scores,
      rubricTotal: 6.5,
      rubricMax: 8,
      status: "graded",
    });
    await assertSucceeds(
      updateDoc(
        doc(as("teacherA"), subPath),
        grade({
          grade: 5,
          feedback: deleteField(),
          rubricScores: deleteField(),
          rubricTotal: deleteField(),
          rubricMax: deleteField(),
        }),
      ),
    );
  });

  it("never lets the student write them, or another teacher", async () => {
    await assertFails(
      updateDoc(doc(as("studentA"), subPath), {
        rubricScores: scores,
        rubricTotal: 6.5,
        rubricMax: 8,
      }),
    );
    await assertFails(updateDoc(doc(as("teacherB"), subPath), grade()));
  });
});
