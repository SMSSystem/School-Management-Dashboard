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
  OTHER_INST,
  as,
  assertFails,
  assertSucceeds,
  minutesFromNow,
  resetAndSeedUsers,
  seedDoc,
  startEnv,
  stopEnv,
} from "./helpers";

// Who may read and change a rubric and its stored file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 10.3). The grid
// stays open to any teacher. The file is the uploader's or an admin's. A spectator views a rubric but can't read its file.

const RUBRIC = "rubric1";
const rubricPath = (id = RUBRIC, inst = INST) =>
  `institutions/${inst}/rubrics/${id}`;
const filePath = (id = RUBRIC, inst = INST) =>
  `${rubricPath(id, inst)}/file/current`;
const DATA_URL = `data:application/pdf;base64,${"A".repeat(100)}`;
const MIME = "application/pdf";

const criterion = {
  id: "c1",
  name: "Content",
  maxPoints: 4,
  levels: [{ label: "Good", points: 4 }],
};

/** A rubric as today's app saves one: no file and no updatedAt. */
function typedRubric(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    institutionId: INST,
    title: "Oral presentation",
    criteria: [criterion],
    createdBy: "teacherA",
    createdByRole: "regular_teacher",
    createdAt: Timestamp.now(),
    ...over,
  };
}

const storedSummary = (uid: string) => ({
  fileName: "rubric.pdf",
  mimeType: MIME,
  size: 100,
  uploadedBy: uid,
  uploadedByName: uid,
  uploadedAt: Timestamp.now(),
});
const storedBody = (uid: string) => ({
  institutionId: INST,
  dataUrl: DATA_URL,
  fileName: "rubric.pdf",
  mimeType: MIME,
  size: 100,
  uploadedBy: uid,
  uploadedAt: Timestamp.now(),
});

/** A rubric that holds a file, created and uploaded by this person. */
async function seedFileRubric(uid = "teacherA"): Promise<void> {
  await seedDoc(
    rubricPath(),
    typedRubric({ createdBy: uid, criteria: [], file: storedSummary(uid) }),
  );
  await seedDoc(filePath(), storedBody(uid));
}

const newSummary = (uid: string, over: Record<string, unknown> = {}) => ({
  fileName: "new.pdf",
  mimeType: MIME,
  size: 100,
  uploadedBy: uid,
  uploadedByName: uid,
  uploadedAt: serverTimestamp(),
  ...over,
});
const newBody = (uid: string, over: Record<string, unknown> = {}) => ({
  institutionId: INST,
  dataUrl: DATA_URL,
  fileName: "new.pdf",
  mimeType: MIME,
  size: 100,
  uploadedBy: uid,
  uploadedAt: serverTimestamp(),
  ...over,
});

/** The batch the app writes to add or replace a file: the summary on the rubric, and the body. */
function saveFile(
  db: Firestore,
  uid: string,
  summary = newSummary(uid),
  body: Record<string, unknown> = newBody(uid),
) {
  const batch = writeBatch(db);
  batch.update(doc(db, rubricPath()), { file: summary });
  batch.set(doc(db, filePath()), body);
  return batch.commit();
}

/** The batch the app writes to remove a file and keep the grid. */
function removeFile(db: Firestore) {
  const batch = writeBatch(db);
  batch.update(doc(db, rubricPath()), { file: deleteField() });
  batch.delete(doc(db, filePath()));
  return batch.commit();
}

/** The batch the app writes to delete a rubric and its file. */
function deleteBoth(db: Firestore) {
  const batch = writeBatch(db);
  batch.delete(doc(db, filePath()));
  batch.delete(doc(db, rubricPath()));
  return batch.commit();
}

beforeAll(startEnv);
afterAll(stopEnv);
beforeEach(resetAndSeedUsers);

describe("a rubric as today’s app writes it", () => {
  it("any teacher can create one and edit its grid", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("teacherA"), rubricPath("new")),
        typedRubric({ createdAt: serverTimestamp() }),
      ),
    );
    await seedDoc(rubricPath(), typedRubric());
    await assertSucceeds(
      updateDoc(doc(as("teacherB"), rubricPath()), {
        institutionId: INST,
        title: "Renamed",
        criteria: [criterion],
      }),
    );
  });

  it("any teacher can record when the grid changed", async () => {
    await seedDoc(rubricPath(), typedRubric());
    await assertSucceeds(
      updateDoc(doc(as("teacherB"), rubricPath()), {
        criteria: [],
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("a student, parent and spectator cannot write one, and all three can read it", async () => {
    await seedDoc(rubricPath(), typedRubric());
    for (const uid of ["studentA", "parentA", "spectator"]) {
      await assertFails(
        updateDoc(doc(as(uid), rubricPath()), { title: "Mine" }),
      );
      await assertFails(
        setDoc(
          doc(as(uid), rubricPath("new")),
          typedRubric({ createdBy: uid }),
        ),
      );
      await assertSucceeds(getDoc(doc(as(uid), rubricPath())));
    }
  });

  it("caps the title and the number of criteria", async () => {
    await assertFails(
      setDoc(
        doc(as("teacherA"), rubricPath("long")),
        typedRubric({ title: "x".repeat(151) }),
      ),
    );
    await assertFails(
      setDoc(
        doc(as("teacherA"), rubricPath("many")),
        typedRubric({ criteria: Array.from({ length: 51 }, () => criterion) }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(as("teacherA"), rubricPath("most")),
        typedRubric({ criteria: Array.from({ length: 50 }, () => criterion) }),
      ),
    );
  });
});

describe("who created a rubric", () => {
  it("cannot change, so a teacher cannot claim a colleague’s rubric", async () => {
    await seedDoc(rubricPath(), typedRubric());
    await assertFails(
      updateDoc(doc(as("teacherB"), rubricPath()), { createdBy: "teacherB" }),
    );
    await assertFails(
      updateDoc(doc(as("teacherB"), rubricPath()), {
        createdByRole: "senior_teacher",
      }),
    );
    await assertFails(
      updateDoc(doc(as("teacherB"), rubricPath()), {
        createdAt: Timestamp.now(),
      }),
    );
  });

  it("cannot be changed by the file trick: attach a file, claim the rubric, then delete it", async () => {
    await seedDoc(rubricPath(), typedRubric());
    const teacherB = as("teacherB");
    await assertFails(
      updateDoc(doc(teacherB, rubricPath()), {
        createdBy: "teacherB",
        file: newSummary("teacherB"),
      }),
    );
    await assertSucceeds(saveFile(teacherB, "teacherB"));
    await assertFails(deleteBoth(teacherB));
    await assertFails(deleteDoc(doc(teacherB, rubricPath())));
  });
});

describe("creating a rubric from a file", () => {
  const upload = (
    db: Firestore,
    uid: string,
    summary = newSummary(uid),
    body: Record<string, unknown> = newBody(uid),
    id = "up",
  ) => {
    const batch = writeBatch(db);
    batch.set(
      doc(db, rubricPath(id)),
      typedRubric({
        createdBy: uid,
        criteria: [],
        createdAt: serverTimestamp(),
        file: summary,
      }),
    );
    batch.set(doc(db, filePath(id)), body);
    return batch.commit();
  };

  it("works for a teacher and an admin, in one batch", async () => {
    await assertSucceeds(upload(as("teacherA"), "teacherA"));
    await assertSucceeds(
      upload(
        as("admin"),
        "admin",
        newSummary("admin"),
        newBody("admin"),
        "up2",
      ),
    );
  });

  it("cannot name someone else as the uploader", async () => {
    await assertFails(
      upload(as("teacherA"), "teacherA", newSummary("teacherB")),
    );
    await assertFails(
      upload(
        as("teacherA"),
        "teacherA",
        newSummary("teacherA"),
        newBody("teacherB"),
      ),
    );
  });

  it("cannot leave out the summary or forge the upload time", async () => {
    const db = as("teacherA");
    await assertFails(setDoc(doc(db, filePath("none")), newBody("teacherA")));
    await assertFails(
      upload(
        db,
        "teacherA",
        newSummary("teacherA", { uploadedAt: minutesFromNow(-1) }),
      ),
    );
    await assertFails(
      upload(
        db,
        "teacherA",
        newSummary("teacherA"),
        newBody("teacherA", { uploadedAt: minutesFromNow(-1) }),
      ),
    );
  });

  it("a student, parent and spectator cannot upload", async () => {
    for (const uid of ["studentA", "parentA", "spectator"])
      await assertFails(upload(as(uid), uid));
  });

  it("refuses a body of the wrong type or size, or with an extra field", async () => {
    const db = as("teacherA");
    const bad = (over: Record<string, unknown>) =>
      upload(db, "teacherA", newSummary("teacherA"), newBody("teacherA", over));
    await assertFails(
      bad({ dataUrl: `data:image/png;base64,${"A".repeat(10)}` }),
    );
    await assertFails(
      bad({ dataUrl: `data:text/html;base64,${"A".repeat(10)}` }),
    );
    await assertFails(
      bad({ dataUrl: `data:application/pdf;base64,${"A".repeat(700_000)}` }),
    );
    await assertFails(bad({ size: 512_001 }));
    await assertFails(bad({ size: 0 }));
    await assertFails(bad({ extra: true }));
    await assertFails(bad({ fileName: "x".repeat(256) }));
  });

  it("accepts every allowed type", async () => {
    const types = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "text/markdown",
    ];
    for (const mimeType of types) {
      await assertSucceeds(
        upload(
          as("teacherA"),
          "teacherA",
          newSummary("teacherA", { mimeType }),
          newBody("teacherA", {
            mimeType,
            dataUrl: `data:${mimeType};base64,AAAA`,
          }),
          `up-${types.indexOf(mimeType)}`,
        ),
      );
    }
  });

  it('the file id is always "current"', async () => {
    const db = as("teacherA");
    const batch = writeBatch(db);
    batch.set(
      doc(db, rubricPath("up")),
      typedRubric({ createdBy: "teacherA", file: newSummary("teacherA") }),
    );
    batch.set(doc(db, `${rubricPath("up")}/file/other`), newBody("teacherA"));
    await assertFails(batch.commit());
  });
});

describe("reading a stored file", () => {
  beforeEach(() => seedFileRubric());

  it("staff, a student and a parent can read it", async () => {
    for (const uid of [
      "admin",
      "teacherA",
      "teacherB",
      "seniorSame",
      "studentA",
      "parentA",
    ]) {
      await assertSucceeds(getDoc(doc(as(uid), filePath())));
    }
  });

  it("a spectator cannot", async () => {
    await assertFails(getDoc(doc(as("spectator"), filePath())));
  });

  it("another school cannot", async () => {
    await assertFails(getDoc(doc(as("outsiderAdmin"), filePath())));
    await seedDoc(
      rubricPath(RUBRIC, OTHER_INST),
      typedRubric({ institutionId: OTHER_INST }),
    );
    await assertFails(
      getDoc(doc(as("teacherA"), filePath(RUBRIC, OTHER_INST))),
    );
  });
});

describe("replacing a stored file", () => {
  beforeEach(() => seedFileRubric());

  it("the uploader and an admin can", async () => {
    await assertSucceeds(saveFile(as("teacherA"), "teacherA"));
    await assertSucceeds(saveFile(as("admin"), "admin"));
  });

  it("an admin who replaces a file becomes its owner, so the first teacher can no longer change it", async () => {
    await assertSucceeds(saveFile(as("admin"), "admin"));
    await assertFails(saveFile(as("teacherA"), "teacherA"));
    await assertFails(removeFile(as("teacherA")));
  });

  it("a colleague cannot, even a senior teacher in the same department", async () => {
    await assertFails(saveFile(as("teacherB"), "teacherB"));
    await assertFails(saveFile(as("seniorSame"), "seniorSame"));
  });

  it("a colleague cannot clear or change the summary alone", async () => {
    const db = as("teacherB");
    await assertFails(
      updateDoc(doc(db, rubricPath()), { file: deleteField() }),
    );
    await assertFails(
      updateDoc(doc(db, rubricPath()), { file: newSummary("teacherB") }),
    );
    await assertFails(
      updateDoc(doc(db, rubricPath()), { "file.fileName": "renamed.pdf" }),
    );
  });

  it("the uploader cannot pass the file to a colleague", async () => {
    await assertFails(
      saveFile(
        as("teacherA"),
        "teacherA",
        newSummary("teacherB"),
        newBody("teacherB"),
      ),
    );
  });

  it("the body cannot change without the summary naming the caller", async () => {
    await assertFails(setDoc(doc(as("admin"), filePath()), newBody("admin")));
  });

  it("a colleague can still edit the grid of a rubric that holds someone’s file", async () => {
    await assertSucceeds(
      updateDoc(doc(as("teacherB"), rubricPath()), {
        criteria: [criterion],
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe("attaching a file to a typed rubric", () => {
  it("any teacher can, as they can edit its grid", async () => {
    await seedDoc(rubricPath(), typedRubric());
    await assertSucceeds(saveFile(as("teacherB"), "teacherB"));
  });
});

describe("removing a stored file", () => {
  beforeEach(() => seedFileRubric());

  it("the uploader and an admin can", async () => {
    await assertSucceeds(removeFile(as("teacherA")));
  });

  it("an admin can", async () => {
    await assertSucceeds(removeFile(as("admin")));
  });

  it("a colleague cannot", async () => {
    await assertFails(removeFile(as("teacherB")));
    await assertFails(deleteDoc(doc(as("teacherB"), filePath())));
  });
});

describe("a grid read from a file, with the file not kept (D16, D20)", () => {
  const bare = { id: "c2", name: "Presentation", maxPoints: 10, levels: [] };

  /** The batch the app writes to replace a grid from a file and remove the stored file. */
  function replaceGrid(db: Firestore) {
    const batch = writeBatch(db);
    batch.update(doc(db, rubricPath()), {
      criteria: [criterion, bare],
      updatedAt: serverTimestamp(),
      file: deleteField(),
    });
    batch.delete(doc(db, filePath()));
    return batch.commit();
  }

  it("any teacher can save one, with a criterion that has no levels", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("teacherB"), rubricPath("read")),
        typedRubric({
          createdBy: "teacherB",
          criteria: [criterion, bare],
          createdAt: serverTimestamp(),
          readFrom: { fileName: "rubric.md" },
        }),
      ),
    );
  });

  it("the uploader and an admin can replace the grid and remove the file in one batch", async () => {
    await seedFileRubric();
    await assertSucceeds(replaceGrid(as("teacherA")));
    await seedFileRubric();
    await assertSucceeds(replaceGrid(as("admin")));
  });

  it("its creator can delete a rubric read from a file, and a colleague cannot", async () => {
    await seedDoc(
      rubricPath(),
      typedRubric({ readFrom: { fileName: "r.md" } }),
    );
    await assertFails(deleteDoc(doc(as("teacherB"), rubricPath())));
    await assertSucceeds(deleteDoc(doc(as("teacherA"), rubricPath())));
  });

  it("readFrom is checked when set, and can't be added or changed later", async () => {
    const make = (readFrom: unknown) =>
      setDoc(
        doc(as("teacherA"), rubricPath("bad")),
        typedRubric({ readFrom, createdAt: serverTimestamp() }),
      );
    await assertFails(make({ fileName: "r.md", extra: 1 }));
    await assertFails(make({ fileName: "x".repeat(256) }));
    await assertFails(make("r.md"));
    await seedDoc(rubricPath(), typedRubric());
    await assertFails(
      updateDoc(doc(as("teacherA"), rubricPath()), {
        readFrom: { fileName: "r.md" },
      }),
    );
    await assertFails(deleteDoc(doc(as("teacherA"), rubricPath())));
    await seedDoc(
      rubricPath("read"),
      typedRubric({ readFrom: { fileName: "a.md" } }),
    );
    await assertFails(
      updateDoc(doc(as("teacherA"), rubricPath("read")), {
        readFrom: { fileName: "b.md" },
      }),
    );
  });

  it("a colleague cannot remove someone's file that way", async () => {
    await seedFileRubric();
    await assertFails(replaceGrid(as("teacherB")));
  });
});

describe("deleting a rubric", () => {
  it("a teacher can delete one they created that holds their file", async () => {
    await seedFileRubric();
    await assertSucceeds(deleteBoth(as("teacherA")));
  });

  it("a colleague cannot", async () => {
    await seedFileRubric();
    await assertFails(deleteBoth(as("teacherB")));
    await assertFails(deleteDoc(doc(as("teacherB"), rubricPath())));
  });

  it("a teacher cannot delete a typed rubric, even their own", async () => {
    await seedDoc(rubricPath(), typedRubric());
    await assertFails(deleteDoc(doc(as("teacherA"), rubricPath())));
  });

  it("a teacher cannot delete a rubric they created once an admin owns its file", async () => {
    await seedDoc(
      rubricPath(),
      typedRubric({ criteria: [], file: storedSummary("admin") }),
    );
    await seedDoc(filePath(), storedBody("admin"));
    await assertFails(deleteBoth(as("teacherA")));
  });

  it("an admin can delete any rubric", async () => {
    await seedFileRubric();
    await assertSucceeds(deleteBoth(as("admin")));
    await seedDoc(rubricPath("typed"), typedRubric());
    await assertSucceeds(deleteDoc(doc(as("admin"), rubricPath("typed"))));
  });

  it("a student, parent and spectator cannot", async () => {
    await seedFileRubric();
    for (const uid of ["studentA", "parentA", "spectator"])
      await assertFails(deleteBoth(as(uid)));
  });
});

describe("the audit entry for a file change", () => {
  const entry = (uid: string) => ({
    eventType: "rubric_file_edit",
    detail: "Replaced the file",
    targetUid: RUBRIC,
    targetName: "Oral presentation",
    performedBy: uid,
    performedByName: uid,
    timestamp: serverTimestamp(),
    institutionId: INST,
    recordedAt: serverTimestamp(),
  });
  const auditPath = `institutions/${INST}/audit_log/a1`;

  it("a teacher and an admin can write it", async () => {
    await assertSucceeds(
      setDoc(doc(as("teacherA"), auditPath), entry("teacherA")),
    );
    await assertSucceeds(
      setDoc(doc(as("admin"), `${auditPath}b`), entry("admin")),
    );
  });

  it("a student, parent and spectator cannot", async () => {
    for (const uid of ["studentA", "parentA", "spectator"])
      await assertFails(setDoc(doc(as(uid), auditPath), entry(uid)));
  });
});
