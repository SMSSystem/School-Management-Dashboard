import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
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
import { buildAuditEntry } from "../src/lib/auditEntry";

// Deleting an assignment as the app does (src/lib/assignmentDelete.ts): the preflight counts, then every attempt,
// submission and tombstone in batches, then the assignment with an assignment_delete audit entry. Only administrators
// may delete them; the grades in results stay. The assignment belongs to teacherA, class A.

const AID = "assign1";
const assignment = `institutions/${INST}/assignments/${AID}`;
const sub = (path: string) => `${assignment}/${path}`;
const result = `institutions/${INST}/results/result1`;
const now = Timestamp.now();

async function seedAssignment(): Promise<void> {
  await seedDoc(assignment, {
    institutionId: INST,
    title: "Essay",
    classId: "classA",
    className: "Class A",
    subjectName: "English",
    teacherId: "teacherA",
    status: "published",
    dueDate: "2026-11-20",
    dueDateTimestamp: now,
    gradingMode: "standalone",
  });
  for (const student of ["studentA", "studentA2"]) {
    await seedDoc(sub(`submissions/${student}`), {
      institutionId: INST,
      assignmentId: AID,
      studentId: student,
      status: "graded",
      currentAttemptNumber: 1,
    });
    await seedDoc(sub(`submissions/${student}/attempts/1`), {
      attemptNumber: 1,
      fileName: "a.pdf",
      submittedAt: now,
    });
    await seedDoc(sub(`submissionTombstones/${student}`), {
      studentId: student,
      firstSubmittedAt: now,
      lastSubmittedAt: now,
      attemptCount: 1,
      wasGraded: true,
    });
  }
  await seedDoc(sub("submissions/studentA/attempts/2"), {
    attemptNumber: 2,
    fileName: "b.pdf",
    submittedAt: now,
  });
  await seedDoc(result, {
    institutionId: INST,
    assignmentId: AID,
    studentId: "studentA",
    score: 8,
  });
  // The rubric's grid frozen at the first grade (src/lib/rubricFreeze.ts).
  await seedDoc(sub("rubric/frozen"), {
    rubricId: "rub1",
    title: "Essay rubric",
    criteria: [{ id: "c1", name: "Content", maxPoints: 4, levels: [] }],
    frozenAt: now,
  });
}

// The same references assignmentDelete.ts builds.
const cascadeRefs = (uid: string) => [
  doc(as(uid), sub("submissions/studentA/attempts/1")),
  doc(as(uid), sub("submissions/studentA/attempts/2")),
  doc(as(uid), sub("submissions/studentA2/attempts/1")),
  doc(as(uid), sub("submissions/studentA")),
  doc(as(uid), sub("submissions/studentA2")),
  doc(as(uid), sub("submissionTombstones/studentA")),
  doc(as(uid), sub("submissionTombstones/studentA2")),
  doc(as(uid), sub("rubric/frozen")),
];

const audit = (uid: string) =>
  buildAuditEntry({
    institutionId: INST,
    eventType: "assignment_delete",
    detail: "Deleted assignment Essay for Class A, English, with 2 submissions",
    targetUid: AID,
    targetName: "Essay",
    performedBy: uid,
    performedByName: uid,
  });

describe("deleting an assignment", () => {
  beforeAll(startEnv);
  afterAll(stopEnv);
  beforeEach(async () => {
    await resetAndSeedUsers();
    await seedAssignment();
  });

  it("lets an administrator count the submissions and the grades for the confirmation", async () => {
    const db = as("admin");
    const subs = await assertSucceeds(
      getCountFromServer(collection(db, sub("submissions"))),
    );
    expect(subs.data().count).toBe(2);
    const grades = await assertSucceeds(
      getCountFromServer(
        query(
          collection(db, `institutions/${INST}/results`),
          where("assignmentId", "==", AID),
        ),
      ),
    );
    expect(grades.data().count).toBe(1);
  });

  it("lets an administrator read and delete everything under it, then the assignment with its audit entry, and keeps the grade", async () => {
    const db = as("admin");
    await assertSucceeds(
      getDocs(collection(db, sub("submissions/studentA/attempts"))),
    );
    await assertSucceeds(getDocs(collection(db, sub("submissionTombstones"))));
    const first = writeBatch(db);
    for (const ref of cascadeRefs("admin")) first.delete(ref);
    await assertSucceeds(first.commit());

    const last = writeBatch(db);
    last.delete(doc(db, assignment));
    last.set(
      doc(collection(db, `institutions/${INST}/audit_log`)),
      audit("admin"),
    );
    await assertSucceeds(last.commit());

    expect((await getDoc(doc(db, assignment))).exists()).toBe(false);
    expect((await getDocs(collection(db, sub("submissions")))).size).toBe(0);
    expect((await getDoc(doc(db, result))).exists()).toBe(true);
  });

  it("lets an administrator clear leftovers after the assignment is already gone", async () => {
    const db = as("admin");
    const gone = writeBatch(db);
    gone.delete(doc(db, assignment));
    await assertSucceeds(gone.commit());
    await assertSucceeds(getDocs(collection(db, sub("submissions"))));
    const left = writeBatch(db);
    for (const ref of cascadeRefs("admin")) left.delete(ref);
    await assertSucceeds(left.commit());
  });

  it("refuses its own teacher, a senior teacher, a student, a parent and a spectator", async () => {
    for (const uid of [
      "teacherA",
      "seniorSame",
      "studentA",
      "parentA",
      "spectator",
    ]) {
      for (const path of [
        "submissions/studentA",
        "submissions/studentA/attempts/1",
        "submissionTombstones/studentA",
      ]) {
        const batch = writeBatch(as(uid));
        batch.delete(doc(as(uid), sub(path)));
        await assertFails(batch.commit());
      }
    }
  });

  it("refuses an administrator of another institution", async () => {
    const batch = writeBatch(as("outsiderAdmin"));
    batch.delete(doc(as("outsiderAdmin"), sub("submissions/studentA")));
    await assertFails(batch.commit());
  });

  it("still never lets anyone change an attempt", async () => {
    await assertFails(
      updateDoc(doc(as("admin"), sub("submissions/studentA/attempts/1")), {
        fileName: "c.pdf",
      }),
    );
  });

  it("refuses a teacher writing an assignment_delete audit entry", async () => {
    const batch = writeBatch(as("teacherA"));
    batch.set(
      doc(collection(as("teacherA"), `institutions/${INST}/audit_log`)),
      audit("teacherA"),
    );
    await assertFails(batch.commit());
  });
});
