import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  CLASS_A,
  DEPT,
  INST,
  as,
  assertFails,
  assertSucceeds,
  resetAndSeedUsers,
  seed,
  startEnv,
  stopEnv,
} from "./helpers";
import { buildAuditEntry } from "../src/lib/auditEntry";

// What today's rules do for the planned offline outbox, which needs to re-send a save safely after a lost reply.
// These pin the current behaviour on purpose: a later rule change for the outbox has to change them knowingly.

const SUBJECT = "subj1";
const path = (rest: string) => `institutions/${INST}/${rest}`;

const subjectRegister = (over: Record<string, unknown> = {}) => ({
  institutionId: INST,
  subjectId: SUBJECT,
  classId: CLASS_A,
  sessionDate: "2026-11-02",
  teacherId: "teacherA",
  records: { studentA: { state: "P" } },
  ...over,
});

const generalRegister = (over: Record<string, unknown> = {}) => ({
  institutionId: INST,
  classId: CLASS_A,
  date: "2026-11-02",
  session: "AM",
  records: { studentA: { state: "P" } },
  ...over,
});

const result = (teacherId: string, over: Record<string, unknown> = {}) => ({
  institutionId: INST,
  studentId: "studentA",
  subjectId: SUBJECT,
  departmentId: DEPT,
  score: 5,
  maxScore: 10,
  teacherId,
  ...over,
});

const auditEntry = (performedBy: string) =>
  buildAuditEntry({
    institutionId: INST,
    eventType: "attendance_edit",
    detail: "Saved a register",
    targetUid: CLASS_A,
    targetName: "Class A",
    performedBy,
    performedByName: performedBy,
  });

beforeAll(startEnv);
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  // teacherA and teacherB share the subject; seniorSame looks after Class A.
  await seed(async (db) => {
    await setDoc(doc(db, path(`subjects/${SUBJECT}`)), {
      institutionId: INST,
      teacherIds: ["teacherA", "teacherB"],
    });
    await setDoc(
      doc(db, "users/seniorSame"),
      { assignedClassId: CLASS_A },
      { merge: true },
    );
  });
});

describe("reading a register before saving it", () => {
  it("is refused for a regular teacher when the subject register does not exist yet", async () => {
    await assertFails(
      getDoc(doc(as("teacherA"), path("subjectAttendance/not-yet"))),
    );
  });

  it("fails a transaction that starts by reading a subject register that does not exist yet", async () => {
    await assertFails(
      runTransaction(as("teacherA"), async (tx) => {
        await tx.get(doc(as("teacherA"), path("subjectAttendance/not-yet")));
      }),
    );
  });

  it("is allowed for a regular teacher of the subject once the register exists", async () => {
    await seed((db) =>
      setDoc(doc(db, path("subjectAttendance/saved")), subjectRegister()),
    );
    await assertSucceeds(
      getDoc(doc(as("teacherA"), path("subjectAttendance/saved"))),
    );
  });

  it("is allowed for a senior teacher when the general register does not exist yet", async () => {
    await assertSucceeds(
      getDoc(doc(as("seniorSame"), path("generalAttendance/not-yet"))),
    );
  });
});

describe("the audit log and a repeated save", () => {
  it("refuses a teacher reading an entry that does not exist", async () => {
    await assertFails(getDoc(doc(as("teacherA"), path("audit_log/not-yet"))));
  });

  it("lets a teacher read their own entry once it exists", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("teacherA"), path("audit_log/op1")),
        auditEntry("teacherA"),
      ),
    );
    await assertSucceeds(getDoc(doc(as("teacherA"), path("audit_log/op1"))));
  });

  it("refuses a second write at the same id, so a re-sent batch would fail as a whole", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("teacherA"), path("audit_log/op1")),
        auditEntry("teacherA"),
      ),
    );
    await assertFails(
      setDoc(
        doc(as("teacherA"), path("audit_log/op1")),
        auditEntry("teacherA"),
      ),
    );
  });

  it("refuses an extra field, so an operation id cannot be stored on the entry", async () => {
    await assertFails(
      setDoc(doc(as("teacherA"), path("audit_log/op1")), {
        ...auditEntry("teacherA"),
        opId: "op1",
      }),
    );
  });
});

describe("results at a chosen id", () => {
  const CELL = "results/column1_studentA";

  it("can be read by a teacher before they exist", async () => {
    await assertSucceeds(getDoc(doc(as("teacherA"), path(CELL))));
  });

  it("can be created by a teacher of the subject", async () => {
    await assertSucceeds(
      setDoc(doc(as("teacherA"), path(CELL)), result("teacherA")),
    );
  });

  it("can be updated by the teacher who created them", async () => {
    await seed((db) => setDoc(doc(db, path(CELL)), result("teacherA")));
    await assertSucceeds(
      updateDoc(doc(as("teacherA"), path(CELL)), { score: 6 }),
    );
  });

  it("cannot be updated by a co-teacher of the same subject", async () => {
    await seed((db) => setDoc(doc(db, path(CELL)), result("teacherA")));
    await assertFails(updateDoc(doc(as("teacherB"), path(CELL)), { score: 6 }));
    await assertFails(
      setDoc(doc(as("teacherB"), path(CELL)), result("teacherB", { score: 6 })),
    );
  });
});

describe("recording the last operation on the document itself", () => {
  const lastOpByUser = { teacherA: "op1" };

  it("is accepted on a subject register", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("teacherA"), path("subjectAttendance/r1")),
        subjectRegister({ lastOpByUser }),
      ),
    );
  });

  it("is accepted on a general register", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("seniorSame"), path("generalAttendance/r1")),
        generalRegister({ lastOpByUser: { seniorSame: "op1" } }),
      ),
    );
  });

  it("is accepted on a result", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("teacherA"), path("results/r1")),
        result("teacherA", { lastOpByUser }),
      ),
    );
  });
});

describe("editing a subject register with mergeFields", () => {
  it("is accepted, keeps createdAt and replaces the records whole", async () => {
    const ref = path("subjectAttendance/saved");
    await seed((db) =>
      setDoc(
        doc(db, ref),
        subjectRegister({
          createdAt: "first",
          records: { studentA: { state: "P" }, studentA2: { state: "A" } },
        }),
      ),
    );

    const edit = subjectRegister({ records: { studentA: { state: "L" } } });
    await assertSucceeds(
      setDoc(doc(as("teacherA"), ref), edit, {
        mergeFields: Object.keys(edit),
      }),
    );

    const saved = (await getDoc(doc(as("teacherA"), ref))).data();
    expect(saved?.createdAt).toBe("first");
    expect(saved?.records).toEqual({ studentA: { state: "L" } });
  });
});
