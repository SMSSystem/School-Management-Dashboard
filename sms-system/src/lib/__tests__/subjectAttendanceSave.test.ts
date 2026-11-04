import { beforeEach, describe, expect, it, vi } from "vitest";

const batchSet = vi.fn();

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  collection: vi.fn(() => ({ kind: "collection" })),
  doc: vi.fn(() => ({ kind: "doc" })),
  deleteField: vi.fn(() => "DELETE"),
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

const save = (
  existingDocId: string | null,
  savedRecords?: Record<string, { state: string; studentName: string }>,
  records: Record<string, { state: string; studentName: string }> = {},
) =>
  saveSubjectRegister({
    institutionId: "inst1",
    uid: "teacherA",
    performedByName: "Teacher A",
    existingDocId,
    savedRecords,
    subjectId: "subj1",
    subjectName: "Maths",
    classId: "classA",
    className: "Class A",
    dateISO: "2026-11-02",
    termId: "term1",
    academicYearId: "year1",
    records,
  });

// The first batch.set is the register; the second is its audit entry.
const registerWrite = () =>
  batchSet.mock.calls[0] as [
    unknown,
    Record<string, unknown>,
    { merge?: boolean }?,
  ];

describe("saving a subject register", () => {
  const p = { state: "P", studentName: "A" };
  const late = { state: "L", studentName: "A" };

  beforeEach(() => batchSet.mockClear());

  it("merges a new register, with createdAt and every mark", async () => {
    await save(null, undefined, { s1: p });
    const [, data, options] = registerWrite();
    expect(data.createdAt).toBe("SERVER_TIME");
    expect(data.records).toEqual({ s1: p });
    expect(options).toEqual({ merge: true });
  });

  it("sends only what changed on an edit, and no createdAt", async () => {
    await save("saved", { s1: p, s2: p }, { s1: p, s2: late });
    const [, data, options] = registerWrite();
    expect(data).not.toHaveProperty("createdAt");
    expect(data.records).toEqual({ s2: late });
    expect(options).toEqual({ merge: true });
  });

  it("removes a student taken off the register", async () => {
    await save("saved", { s1: p, gone: p }, { s1: p });
    expect(registerWrite()[1].records).toEqual({ gone: "DELETE" });
  });

  it("leaves records out when an edit changed nothing, so the saved marks stay", async () => {
    await save("saved", { s1: p }, { s1: p });
    expect(registerWrite()[1]).not.toHaveProperty("records");
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
