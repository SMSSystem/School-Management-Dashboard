import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Firestore,
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

// Freezing an assignment's rubric at the first grade (src/lib/rubricFreeze.ts, src/lib/grading.ts): in one batch, a
// grader writes the grid to assignments/{id}/rubric/frozen and marks the assignment (rubricFrozenAt, rubricFrozenTitle),
// once. Nobody changes either afterwards, the assignment's rubric can't change, and the grid is read by whoever reads
// the assignment. The assignment belongs to teacherA (department dept1, class A, published).

const AID = "assignFreeze";
const path = `institutions/${INST}/assignments/${AID}`;
const gridPath = `${path}/rubric/frozen`;
const now = Timestamp.now();
const criteria = [
  {
    id: "c1",
    name: "Content",
    maxPoints: 4,
    levels: [{ label: "Good", points: 4 }],
  },
];
const base = {
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
const grid = (over: Record<string, unknown> = {}) => ({
  rubricId: "rub1",
  title: "Essay rubric",
  criteria,
  frozenAt: serverTimestamp(),
  ...over,
});
const marker = (over: Record<string, unknown> = {}) => ({
  rubricFrozenAt: serverTimestamp(),
  rubricFrozenTitle: "Essay rubric",
  ...over,
});

function freeze(
  db: Firestore,
  gridOver: Record<string, unknown> = {},
  markerOver: Record<string, unknown> = {},
) {
  const batch = writeBatch(db);
  batch.set(doc(db, gridPath), grid(gridOver));
  batch.update(doc(db, path), marker(markerOver));
  return batch.commit();
}

describe("freezing an assignment's rubric", () => {
  beforeAll(startEnv);
  afterAll(stopEnv);
  beforeEach(async () => {
    await resetAndSeedUsers();
    await seedDoc(path, base);
  });

  it("lets the assignment's teacher, a senior teacher of the department and an admin freeze it", async () => {
    for (const uid of ["teacherA", "seniorSame", "admin"]) {
      await resetAndSeedUsers();
      await seedDoc(path, base);
      await assertSucceeds(freeze(as(uid)));
    }
  });

  it("freezes inside a real grading batch, with the submission and the tombstone", async () => {
    await seedDoc(`${path}/submissions/studentA`, {
      institutionId: INST,
      assignmentId: AID,
      studentId: "studentA",
      status: "submitted",
    });
    await seedDoc(`${path}/submissionTombstones/studentA`, {
      studentId: "studentA",
      firstSubmittedAt: now,
      lastSubmittedAt: now,
      attemptCount: 1,
      wasGraded: false,
    });
    const db = as("teacherA");
    const batch = writeBatch(db);
    batch.update(doc(db, `${path}/submissions/studentA`), {
      grade: 3,
      maxGrade: 4,
      gradedBy: "teacherA",
      gradedByName: "A",
      gradedAt: serverTimestamp(),
      status: "graded",
    });
    batch.update(doc(db, `${path}/submissionTombstones/studentA`), {
      wasGraded: true,
    });
    batch.set(doc(db, gridPath), grid());
    batch.update(doc(db, path), marker());
    await assertSucceeds(batch.commit());
  });

  it("refuses other teachers, students, parents and spectators", async () => {
    for (const uid of [
      "teacherB",
      "seniorOther",
      "studentA",
      "parentA",
      "spectator",
    ]) {
      await assertFails(freeze(as(uid)));
    }
  });

  it("refuses the grid without the marker, the marker without the grid, and either on its own", async () => {
    const db = as("teacherA");
    await assertFails(setDoc(doc(db, gridPath), grid()));
    await assertFails(updateDoc(doc(db, path), marker()));
  });

  it("refuses a copy of another rubric, a bad shape, an empty grid, another document id or a made-up time", async () => {
    const db = as("teacherA");
    await assertFails(freeze(db, { rubricId: "other" }));
    await assertFails(freeze(db, { extra: true }));
    await assertFails(freeze(db, { criteria: [] }));
    await assertFails(freeze(db, { frozenAt: now }));
    await assertFails(freeze(db, {}, { rubricFrozenAt: now }));
    await assertFails(freeze(db, {}, { rubricFrozenTitle: 7 }));
    const batch = writeBatch(db);
    batch.set(doc(db, `${path}/rubric/other`), grid());
    batch.update(doc(db, path), marker());
    await assertFails(batch.commit());
  });

  it("refuses freezing alongside another change, and on an assignment with no rubric", async () => {
    const db = as("teacherA");
    await assertFails(freeze(db, {}, { title: "Changed" }));
    await seedDoc(
      path,
      Object.fromEntries(
        Object.entries(base).filter(([key]) => key !== "rubricId"),
      ),
    );
    await assertFails(freeze(db));
  });

  it("refuses creating an assignment that is already marked frozen", async () => {
    await assertFails(
      setDoc(doc(as("teacherA"), `institutions/${INST}/assignments/newOne`), {
        ...base,
        rubricFrozenAt: now,
        rubricFrozenTitle: "x",
      }),
    );
  });

  describe("once frozen", () => {
    beforeEach(async () => {
      await seedDoc(path, {
        ...base,
        rubricFrozenAt: now,
        rubricFrozenTitle: "Essay rubric",
      });
      await seedDoc(gridPath, {
        rubricId: "rub1",
        title: "Essay rubric",
        criteria,
        frozenAt: now,
      });
    });

    it("can't be frozen again, and neither the grid nor the marker can change or go", async () => {
      const db = as("teacherA");
      await assertFails(freeze(db));
      await assertFails(updateDoc(doc(db, gridPath), { title: "Renamed" }));
      await assertFails(deleteDoc(doc(db, gridPath)));
      await assertFails(
        updateDoc(doc(db, path), { rubricFrozenTitle: "Renamed" }),
      );
      await assertFails(
        updateDoc(doc(db, path), { rubricFrozenAt: deleteField() }),
      );
    });

    it("still lets the teacher edit the assignment, but not change or remove its rubric", async () => {
      const db = as("teacherA");
      await assertSucceeds(
        updateDoc(doc(db, path), { title: "Essay (edited)" }),
      );
      await assertFails(updateDoc(doc(db, path), { rubricId: "rub2" }));
      await assertFails(updateDoc(doc(db, path), { rubricId: deleteField() }));
    });

    it("lets whoever reads the assignment read the grid, and nobody else", async () => {
      for (const uid of [
        "teacherA",
        "seniorSame",
        "admin",
        "spectator",
        "studentA",
        "parentA",
      ]) {
        await assertSucceeds(getDoc(doc(as(uid), gridPath)));
      }
      for (const uid of [
        "teacherB",
        "seniorOther",
        "studentB",
        "outsiderAdmin",
      ]) {
        await assertFails(getDoc(doc(as(uid), gridPath)));
      }
    });

    it("lets only an admin delete the grid, with the assignment", async () => {
      await assertFails(deleteDoc(doc(as("teacherA"), gridPath)));
      await assertSucceeds(deleteDoc(doc(as("admin"), gridPath)));
    });
  });
});
