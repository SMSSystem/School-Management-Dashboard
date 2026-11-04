import { beforeEach, describe, expect, it, vi } from "vitest";

const batchSet = vi.fn();

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  collection: vi.fn(() => ({ kind: "collection" })),
  doc: vi.fn(() => ({ kind: "doc" })),
  serverTimestamp: vi.fn(() => "SERVER_TIME"),
  writeBatch: vi.fn(() => ({ set: batchSet, commit: vi.fn(async () => {}) })),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auditLog", () => ({
  buildAuditEntry: vi.fn(() => ({ audit: true })),
}));
vi.mock("@/lib/paths", () => ({
  institutionCollection: vi.fn(() => ({ kind: "collection" })),
  institutionDoc: vi.fn(() => ({ kind: "doc" })),
}));

const { saveSubjectRegister } = await import("../subjectAttendanceSave");
import gradebookSaveSrc from "../gradebookSave.ts?raw";

const save = (existingDocId: string | null) =>
  saveSubjectRegister({
    institutionId: "inst1",
    uid: "teacherA",
    performedByName: "Teacher A",
    existingDocId,
    subjectId: "subj1",
    subjectName: "Maths",
    classId: "classA",
    className: "Class A",
    dateISO: "2026-11-02",
    termId: "term1",
    academicYearId: "year1",
    records: {},
  });

// The first batch.set is the register; the second is its audit entry.
const registerWrite = () =>
  batchSet.mock.calls[0] as [
    unknown,
    Record<string, unknown>,
    { mergeFields?: string[] }?,
  ];

describe("saving a subject register", () => {
  beforeEach(() => batchSet.mockClear());

  it("sets createdAt on a new register", async () => {
    await save(null);
    const [, data, options] = registerWrite();
    expect(data.createdAt).toBe("SERVER_TIME");
    expect(options).toBeUndefined();
  });

  it("keeps createdAt on an edit by writing only the listed fields", async () => {
    await save("saved");
    const [, data, options] = registerWrite();
    expect(data).not.toHaveProperty("createdAt");
    expect(options?.mergeFields).not.toContain("createdAt");
    expect([...(options?.mergeFields ?? [])].sort()).toEqual(
      Object.keys(data).sort(),
    );
    expect(options?.mergeFields).toContain("records");
  });
});

describe("saving gradebook comments", () => {
  it("sets createdAt only when the comment is first written", () => {
    const src = gradebookSaveSrc.split("\r\n").join("\n");
    expect(src).toContain(
      "...(existingFb ? {} : { createdAt: serverTimestamp() }),",
    );
  });
});
