import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
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

// Freezing an assignment's rubric at the first grade (src/lib/rubricFreeze.ts, src/lib/grading.ts): a grader adds
// rubricFrozen once, as a copy of the assignment's own rubric, and nobody changes or removes it afterwards; nor can the
// assignment's rubric change once it is there. The assignment belongs to teacherA (department dept1).

const AID = "assignFreeze";
const path = `institutions/${INST}/assignments/${AID}`;
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
const frozen = (over: Record<string, unknown> = {}) => ({
  rubricId: "rub1",
  title: "Essay rubric",
  criteria,
  frozenAt: serverTimestamp(),
  ...over,
});
const seededFrozen = {
  rubricId: "rub1",
  title: "Essay rubric",
  criteria,
  frozenAt: now,
};

describe("freezing an assignment's rubric", () => {
  beforeAll(startEnv);
  afterAll(stopEnv);
  beforeEach(async () => {
    await resetAndSeedUsers();
    await seedDoc(path, base);
  });

  it("lets the assignment's teacher, a senior teacher of the department and an admin add it once", async () => {
    for (const uid of ["teacherA", "seniorSame", "admin"]) {
      await seedDoc(path, base);
      await assertSucceeds(
        updateDoc(doc(as(uid), path), { rubricFrozen: frozen() }),
      );
    }
  });

  it("refuses other teachers, students, parents and spectators", async () => {
    for (const uid of [
      "teacherB",
      "seniorOther",
      "studentA",
      "parentA",
      "spectator",
    ]) {
      await assertFails(
        updateDoc(doc(as(uid), path), { rubricFrozen: frozen() }),
      );
    }
  });

  it("refuses a copy of another rubric, a bad shape, an empty grid or a made-up time", async () => {
    const db = as("teacherA");
    await assertFails(
      updateDoc(doc(db, path), { rubricFrozen: frozen({ rubricId: "other" }) }),
    );
    await assertFails(
      updateDoc(doc(db, path), { rubricFrozen: frozen({ extra: true }) }),
    );
    await assertFails(
      updateDoc(doc(db, path), { rubricFrozen: frozen({ criteria: [] }) }),
    );
    await assertFails(
      updateDoc(doc(db, path), { rubricFrozen: frozen({ frozenAt: now }) }),
    );
  });

  it("refuses freezing alongside any other change, and on an assignment with no rubric", async () => {
    const db = as("teacherA");
    await assertFails(
      updateDoc(doc(db, path), { rubricFrozen: frozen(), title: "Changed" }),
    );
    await seedDoc(
      path,
      Object.fromEntries(
        Object.entries(base).filter(([key]) => key !== "rubricId"),
      ),
    );
    await assertFails(updateDoc(doc(db, path), { rubricFrozen: frozen() }));
  });

  describe("once frozen", () => {
    beforeEach(async () => {
      await seedDoc(path, { ...base, rubricFrozen: seededFrozen });
    });

    it("can't be frozen again, changed or removed", async () => {
      const db = as("teacherA");
      await assertFails(updateDoc(doc(db, path), { rubricFrozen: frozen() }));
      await assertFails(
        updateDoc(doc(db, path), { "rubricFrozen.title": "Renamed" }),
      );
      await assertFails(
        updateDoc(doc(db, path), { rubricFrozen: deleteField() }),
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
  });

  it("refuses creating an assignment that is already frozen", async () => {
    await assertFails(
      setDoc(doc(as("teacherA"), `institutions/${INST}/assignments/newOne`), {
        ...base,
        rubricFrozen: frozen(),
      }),
    );
  });
});
