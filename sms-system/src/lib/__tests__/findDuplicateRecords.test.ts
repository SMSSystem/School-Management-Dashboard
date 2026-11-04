import { describe, expect, it } from "vitest";
import {
  COLLECTIONS,
  checkBudget,
  findDuplicates,
  keyOf,
  registerOverlap,
  summarise,
  type Definition,
} from "../../../scripts/findDuplicateRecordsLogic.mjs";
import scriptRaw from "../../../scripts/find-duplicate-records.mjs?raw";
import logicRaw from "../../../scripts/findDuplicateRecordsLogic.mjs?raw";

const definition = (name: string): Definition => {
  const found = COLLECTIONS.find((d) => d.name === name);
  if (!found) throw new Error(`no collection ${name}`);
  return found;
};
const GENERAL = definition("generalAttendance");
const RESULTS = definition("results");
const FEEDBACK = definition("feedback_comments");

const register = (
  id: string,
  records: Record<string, unknown>,
  over: Record<string, unknown> = {},
) => ({
  id,
  data: {
    classId: "c1",
    date: "2026-11-02",
    session: "AM",
    termId: "t1",
    records,
    ...over,
  },
});

describe("what counts as the same record", () => {
  it("needs every part of the key", () => {
    expect(
      keyOf(GENERAL, { classId: "c1", date: "2026-11-02", session: "AM" }),
    ).not.toBeNull();
    expect(keyOf(GENERAL, { classId: "c1", date: "2026-11-02" })).toBeNull();
    expect(
      keyOf(GENERAL, { classId: "", date: "2026-11-02", session: "AM" }),
    ).toBeNull();
  });

  it("keeps parts separate, so joined values cannot collide", () => {
    expect(
      keyOf(RESULTS, { gradebookColumnId: "a_b", studentId: "c" }),
    ).not.toBe(keyOf(RESULTS, { gradebookColumnId: "a", studentId: "b_c" }));
  });

  it("uses each collection’s own date field", () => {
    expect(definition("subjectAttendance").keyFields).toContain("sessionDate");
    expect(GENERAL.keyFields).toContain("date");
  });

  it("reads only gradebook results", () => {
    expect(RESULTS.where).toEqual(["gradebookColumnId", ">", ""]);
  });
});

describe("finding duplicates", () => {
  it("reports nothing when every record is alone", () => {
    const scan = findDuplicates(GENERAL, [
      register("a", {}),
      register("b", {}, { session: "PM" }),
      register("c", {}, { classId: "c2" }),
    ]);
    expect(scan.duplicates).toEqual([]);
    expect(summarise(scan)).toMatchObject({
      scanned: 3,
      groups: 0,
      extraDocuments: 0,
    });
  });

  it("groups registers for one class, date and session, and counts the marks summaries add up twice", () => {
    const scan = findDuplicates(GENERAL, [
      register("a", {
        s1: { state: "P" },
        s2: { state: "P" },
        s3: { state: "A" },
      }),
      register("b", { s1: { state: "A" }, s2: { state: "P" } }),
    ]);
    expect(scan.duplicates).toHaveLength(1);
    expect(scan.duplicates[0]).toMatchObject({
      classId: "c1",
      date: "2026-11-02",
      session: "AM",
      documents: 2,
      documentIds: ["a", "b"],
      valuesDiffer: true,
      studentsInMoreThanOne: 2,
      studentsWithDifferentMarks: 1,
      extraMarksCounted: 2,
    });
    expect(summarise(scan)).toMatchObject({
      groups: 1,
      extraDocuments: 1,
      groupsThatDiffer: 1,
      extraMarksCounted: 2,
    });
  });

  it("counts three registers for one session as two extra documents", () => {
    const scan = findDuplicates(GENERAL, [
      register("a", { s1: { state: "P" } }),
      register("b", { s1: { state: "P" } }),
      register("c", { s1: { state: "P" } }),
    ]);
    expect(summarise(scan)).toMatchObject({
      groups: 1,
      extraDocuments: 2,
      groupsThatDiffer: 0,
      extraMarksCounted: 2,
    });
  });

  it("tells identical results from ones that differ", () => {
    const row = (id: string, score: number) => ({
      id,
      data: {
        gradebookColumnId: "col1",
        studentId: "s1",
        classId: "c1",
        score,
        maxScore: 10,
      },
    });
    expect(
      findDuplicates(RESULTS, [row("a", 5), row("b", 5)]).duplicates[0]
        .valuesDiffer,
    ).toBe(false);
    expect(
      findDuplicates(RESULTS, [row("a", 5), row("b", 6)]).duplicates[0]
        .valuesDiffer,
    ).toBe(true);
  });

  it("counts documents with a missing key part as skipped, not as duplicates", () => {
    const scan = findDuplicates(GENERAL, [
      register("a", {}, { date: undefined }),
      register("b", {}, { date: undefined }),
    ]);
    expect(scan).toMatchObject({ scanned: 2, skipped: 2, duplicates: [] });
  });

  it("survives a register with no records", () => {
    expect(
      registerOverlap([
        { id: "a", data: {} },
        { id: "b", data: { records: null } },
      ]),
    ).toEqual({
      studentsInMoreThanOne: 0,
      studentsWithDifferentMarks: 0,
      extraMarksCounted: 0,
    });
  });
});

describe("what a report may contain", () => {
  const secretRecords = {
    "student-uid": { state: "E", reason: "a medical reason" },
  };

  it("holds no student ids, marks or excuse reasons for a register", () => {
    const scan = findDuplicates(GENERAL, [
      register("a", secretRecords),
      register("b", secretRecords),
    ]);
    const text = JSON.stringify(scan);
    expect(text).not.toContain("student-uid");
    expect(text).not.toContain("a medical reason");
    expect(text).not.toContain('"state"');
  });

  it("holds no student id or score for a result", () => {
    const row = (id: string) => ({
      id,
      data: {
        gradebookColumnId: "col1",
        studentId: "student-uid",
        classId: "c1",
        score: 73,
        maxScore: 100,
      },
    });
    const text = JSON.stringify(findDuplicates(RESULTS, [row("a"), row("b")]));
    expect(text).not.toContain("student-uid");
    expect(text).not.toContain("73");
  });

  it("leaves out feedback document ids, which contain the student id", () => {
    const row = (id: string) => ({
      id,
      data: {
        studentId: "student-uid",
        subjectId: "sub1",
        termId: "t1",
        conductGrade: "A",
        commentNumbers: [1],
      },
    });
    const text = JSON.stringify(
      findDuplicates(FEEDBACK, [row("student-uid_sub1_t1"), row("auto")]),
    );
    expect(text).not.toContain("student-uid");
    expect(text).toContain("sub1");
  });
});

describe("the read budget", () => {
  it("allows a scan up to the limit and refuses one over it", () => {
    expect(checkBudget(5000, 5000).allowed).toBe(true);
    expect(checkBudget(5001, 5000).allowed).toBe(false);
  });

  it("gives the share of the daily quota", () => {
    expect(checkBudget(5000, 5000).shareOfDailyQuota).toBe(0.1);
  });
});

describe("the script", () => {
  const code = (raw: string) =>
    raw
      .split("\r\n")
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("cannot write to Firestore", () => {
    for (const source of [code(scriptRaw), code(logicRaw)]) {
      // The in-memory Maps are the only things these files may call .set on.
      const withoutMaps = source.replace(
        /\b(totals|groups|statesByStudent)\.set\(/g,
        "",
      );
      expect(withoutMaps).not.toMatch(
        /\.(set|update|delete|create|add|commit|batch|runTransaction|bulkWriter|recursiveDelete)\(/,
      );
    }
    expect(code(scriptRaw)).not.toContain("--live");
  });

  it("only counts unless asked to read", () => {
    expect(scriptRaw).toContain("read: false");
    expect(scriptRaw).toContain("if (!opts.read) {");
  });

  it("checks the budget before scanning", () => {
    const source = code(scriptRaw);
    expect(source.indexOf("if (!budget.allowed)")).toBeGreaterThan(-1);
    expect(source.indexOf("if (!budget.allowed)")).toBeLessThan(
      source.indexOf("scanCollection(ref"),
    );
  });
});
