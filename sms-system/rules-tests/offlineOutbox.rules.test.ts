import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  deleteField,
  doc,
  getDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
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

// What the rules do for the offline outbox, which re-sends a save safely after a lost reply
// (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C). Slice C allowed reading a subject register that
// doesn't exist yet, for a teacher of the subject named in its fixed id; everything else is pinned as it was.

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

const NEW_REGISTER = `sa_${SUBJECT}_${CLASS_A}_2026-11-20`;

describe("reading a register before saving it", () => {
  it("is allowed for a teacher of the subject named in the register's fixed id", async () => {
    await assertSucceeds(
      getDoc(doc(as("teacherA"), path(`subjectAttendance/${NEW_REGISTER}`))),
    );
  });

  it("lets the outbox's transaction start by reading a subject register that does not exist yet", async () => {
    await assertSucceeds(
      runTransaction(as("teacherA"), async (tx) => {
        await tx.get(doc(as("teacherA"), path(`subjectAttendance/${NEW_REGISTER}`)));
      }),
    );
  });

  it("is refused for a teacher of another subject", async () => {
    await seed((db) =>
      setDoc(doc(db, path("subjects/subj2")), { institutionId: INST, teacherIds: ["teacherB"] }),
    );
    await assertFails(
      getDoc(doc(as("teacherA"), path(`subjectAttendance/sa_subj2_${CLASS_A}_2026-11-20`))),
    );
  });

  it("is refused for an id that isn't a register's fixed id", async () => {
    for (const id of ["not-yet", `sa_${SUBJECT}_${CLASS_A}`, `sa_${SUBJECT}_${CLASS_A}_20-11-2026`, `ga_${SUBJECT}_${CLASS_A}_2026-11-20`]) {
      await assertFails(getDoc(doc(as("teacherA"), path(`subjectAttendance/${id}`))));
    }
  });

  it("is refused for a senior teacher, who can't save subject registers", async () => {
    await assertFails(
      getDoc(doc(as("seniorSame"), path(`subjectAttendance/${NEW_REGISTER}`))),
    );
  });

  it("is refused in another institution", async () => {
    await assertFails(
      getDoc(doc(as("teacherA"), `institutions/inst2/subjectAttendance/${NEW_REGISTER}`)),
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

describe("saving a register at a fixed id with a merge", () => {
  const ref = path("subjectAttendance/sa_subj1_classA_2026-11-02");
  const save = (uid: string, records: Record<string, unknown>) =>
    setDoc(doc(as(uid), ref), subjectRegister({ teacherId: uid, records }), {
      merge: true,
    });
  const saved = async () => (await getDoc(doc(as("teacherA"), ref))).data();

  it("keeps both teachers' marks when two saves reach the same register", async () => {
    await assertSucceeds(save("teacherA", { studentA: { state: "P" } }));
    await assertSucceeds(save("teacherB", { studentA2: { state: "A" } }));
    expect((await saved())?.records).toEqual({
      studentA: { state: "P" },
      studentA2: { state: "A" },
    });
  });

  it("keeps createdAt on an edit that leaves it out", async () => {
    await seed((db) =>
      setDoc(doc(db, ref), subjectRegister({ createdAt: "first" })),
    );
    await assertSucceeds(save("teacherA", { studentA: { state: "L" } }));
    expect((await saved())?.createdAt).toBe("first");
  });

  it("removes a student taken off the register", async () => {
    await seed((db) =>
      setDoc(
        doc(db, ref),
        subjectRegister({
          records: { studentA: { state: "P" }, studentA2: { state: "A" } },
        }),
      ),
    );
    await assertSucceeds(save("teacherA", { studentA2: deleteField() }));
    expect((await saved())?.records).toEqual({ studentA: { state: "P" } });
  });

  it("would wipe the marks if it sent an empty records map, which is why an edit leaves it out", async () => {
    await seed((db) => setDoc(doc(db, ref), subjectRegister()));
    await assertSucceeds(save("teacherA", {}));
    expect((await saved())?.records).toEqual({});
  });

  it("leaves the marks alone when the edit omits records", async () => {
    await seed((db) => setDoc(doc(db, ref), subjectRegister()));
    await assertSucceeds(
      setDoc(
        doc(as("teacherA"), ref),
        { teacherId: "teacherA", institutionId: INST, subjectId: SUBJECT },
        { merge: true },
      ),
    );
    expect((await saved())?.records).toEqual({ studentA: { state: "P" } });
  });
});

describe("the offline key document", () => {
  const KEY = "A".repeat(43) + "=";
  const keyPath = (uid: string) => `users/${uid}/deviceKeys/outbox`;
  const create = (
    as_: string,
    owner: string,
    data: Record<string, unknown> = { key: KEY, createdAt: serverTimestamp() },
  ) => setDoc(doc(as(as_), keyPath(owner)), data);

  it("can be created once by its owner, and read back", async () => {
    await assertSucceeds(create("teacherA", "teacherA"));
    await assertSucceeds(getDoc(doc(as("teacherA"), keyPath("teacherA"))));
  });

  it("can be read by its owner before it exists", async () => {
    await assertSucceeds(getDoc(doc(as("teacherA"), keyPath("teacherA"))));
  });

  it("cannot be changed or removed once created, even by its owner", async () => {
    await assertSucceeds(create("teacherA", "teacherA"));
    await assertFails(create("teacherA", "teacherA"));
    await assertFails(
      updateDoc(doc(as("teacherA"), keyPath("teacherA")), { key: KEY }),
    );
    await assertFails(deleteDoc(doc(as("teacherA"), keyPath("teacherA"))));
  });

  it("cannot be read or created by anyone else, administrators included", async () => {
    await assertSucceeds(create("teacherA", "teacherA"));
    for (const uid of [
      "teacherB",
      "admin",
      "seniorSame",
      "spectator",
      "studentA",
    ]) {
      await assertFails(getDoc(doc(as(uid), keyPath("teacherA"))));
    }
    await assertFails(create("admin", "teacherB"));
  });

  it("must be a 32-byte key with the server's time, and nothing else", async () => {
    await assertFails(
      create("teacherA", "teacherA", {
        key: "short",
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      create("teacherA", "teacherA", { key: KEY, createdAt: "yesterday" }),
    );
    await assertFails(
      create("teacherA", "teacherA", {
        key: KEY,
        createdAt: serverTimestamp(),
        extra: 1,
      }),
    );
    await assertFails(
      setDoc(doc(as("teacherA"), "users/teacherA/deviceKeys/other"), {
        key: KEY,
        createdAt: serverTimestamp(),
      }),
    );
  });
});
