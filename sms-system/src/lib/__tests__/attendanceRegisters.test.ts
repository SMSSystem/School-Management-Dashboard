import { describe, expect, it } from "vitest";
import {
  generalRegisterId,
  recordsField,
  registerPatch,
  subjectRegisterId,
} from "../attendanceRegisters";
import {
  COLLECTION_IDS,
  planMigration,
  withinBudget,
} from "../../../scripts/migrateRegisterIdsLogic.mjs";
import scriptRaw from "../../../scripts/migrate-register-ids.mjs?raw";
import logicRaw from "../../../scripts/migrateRegisterIdsLogic.mjs?raw";
import generalSaveRaw from "../generalAttendanceSave.ts?raw";
import subjectSaveRaw from "../subjectAttendanceSave.ts?raw";
import importWritesRaw from "../importWrites.ts?raw";
import demoSeedRaw from "../../../scripts/seedDemoPrimaryLogic.mjs?raw";

const REMOVED = "REMOVED";

describe("a register's fixed id", () => {
  it("comes from what the register is", () => {
    expect(generalRegisterId("c1", "2026-11-02", "AM")).toBe(
      "ga_c1_2026-11-02_AM",
    );
    expect(subjectRegisterId("s1", "c1", "2026-11-02")).toBe(
      "sa_s1_c1_2026-11-02",
    );
  });

  it("is the same in the app and in the migration script", () => {
    expect(
      COLLECTION_IDS.generalAttendance({
        classId: "c1",
        date: "2026-11-02",
        session: "PM",
      }),
    ).toBe(generalRegisterId("c1", "2026-11-02", "PM"));
    expect(
      COLLECTION_IDS.subjectAttendance({
        subjectId: "s1",
        classId: "c1",
        sessionDate: "2026-11-02",
      }),
    ).toBe(subjectRegisterId("s1", "c1", "2026-11-02"));
  });

  it("is the id the seed scripts already use, so seeded registers need not move", () => {
    expect(demoSeedRaw).toContain("`ga_${cls.id}_${date}_${session}`");
    expect(demoSeedRaw).toContain("`sa_${s.id}_${cls.id}_${date}`");
  });

  it("is used by every path that creates a register", () => {
    expect(generalSaveRaw).toContain(
      "generalRegisterId(classId, dateISO, session)",
    );
    expect(subjectSaveRaw).toContain(
      "subjectRegisterId(subjectId, classId, dateISO)",
    );
    expect(importWritesRaw).toContain(
      "generalRegisterId(g.classId, g.date, g.session)",
    );
    expect(importWritesRaw).toContain(
      "subjectRegisterId(g.subjectId, g.classId, g.sessionDate)",
    );
    for (const source of [generalSaveRaw, subjectSaveRaw, importWritesRaw]) {
      expect(source).not.toContain(
        `doc(institutionCollection(institutionId, "generalAttendance"))`,
      );
      expect(source).not.toContain(
        `doc(institutionCollection(institutionId, 'generalAttendance'))`,
      );
      expect(source).not.toContain(
        `doc(institutionCollection(institutionId, "subjectAttendance"))`,
      );
      expect(source).not.toContain(
        `doc(institutionCollection(institutionId, 'subjectAttendance'))`,
      );
    }
  });
});

describe("what a save sends", () => {
  const p = { state: "P", studentName: "A" };
  const a = { state: "A", studentName: "A" };

  it("sends every student on a new register", () => {
    expect(registerPatch(undefined, { s1: p, s2: a }, REMOVED)).toEqual({
      s1: p,
      s2: a,
    });
  });

  it("sends only the students this save changed", () => {
    expect(registerPatch({ s1: p, s2: p }, { s1: p, s2: a }, REMOVED)).toEqual({
      s2: a,
    });
  });

  it("sends nothing when nothing changed", () => {
    expect(registerPatch({ s1: p }, { s1: { ...p } }, REMOVED)).toEqual({});
  });

  it("treats a changed reason as a change, and a missing reason as no reason", () => {
    const excused = { state: "E", studentName: "A", reason: "Dentist" };
    expect(
      registerPatch(
        { s1: excused },
        { s1: { ...excused, reason: "Doctor" } },
        REMOVED,
      ),
    ).toEqual({
      s1: { ...excused, reason: "Doctor" },
    });
    expect(
      registerPatch({ s1: { ...p, reason: undefined } }, { s1: p }, REMOVED),
    ).toEqual({});
  });

  it("removes a student who is no longer on the register", () => {
    expect(registerPatch({ s1: p, gone: a }, { s1: p }, REMOVED)).toEqual({
      gone: REMOVED,
    });
  });
});

describe("the records field of a merge", () => {
  it("is left out when an edit changed nothing, because an empty map would wipe the saved marks", () => {
    expect(recordsField({}, false)).toEqual({});
  });

  it("is sent on a new register, so readers always find a map", () => {
    expect(recordsField({}, true)).toEqual({ records: {} });
  });

  it("is sent when something changed", () => {
    expect(recordsField({ s1: 1 }, false)).toEqual({ records: { s1: 1 } });
  });
});

describe("planning the migration", () => {
  const data = (over = {}) => ({
    classId: "c1",
    date: "2026-11-02",
    session: "AM",
    ...over,
  });

  it("moves a register at an automatic id to its fixed id", () => {
    expect(
      planMigration("generalAttendance", [{ id: "auto1", data: data() }]).moves,
    ).toEqual([{ from: "auto1", to: "ga_c1_2026-11-02_AM" }]);
  });

  it("leaves a register already at its fixed id alone", () => {
    const plan = planMigration("generalAttendance", [
      { id: "ga_c1_2026-11-02_AM", data: data() },
    ]);
    expect(plan).toMatchObject({ moves: [], alreadyFixed: 1, conflicts: [] });
  });

  it("moves nothing in a group of duplicates, including one already at the fixed id", () => {
    const plan = planMigration("generalAttendance", [
      { id: "auto1", data: data() },
      { id: "auto2", data: data() },
      { id: "ga_c1_2026-11-02_PM", data: data({ session: "PM" }) },
      { id: "auto3", data: data({ session: "PM" }) },
    ]);
    expect(plan.moves).toEqual([]);
    expect(plan.conflicts.map((c) => c.documentIds)).toEqual([
      ["auto1", "auto2"],
      ["ga_c1_2026-11-02_PM", "auto3"],
    ]);
  });

  it("reports a register missing part of its key instead of guessing", () => {
    expect(
      planMigration("subjectAttendance", [
        { id: "auto1", data: { classId: "c1" } },
      ]),
    ).toMatchObject({
      moves: [],
      missingKey: ["auto1"],
    });
  });

  it("uses sessionDate for subject registers", () => {
    const row = {
      id: "auto1",
      data: { subjectId: "s1", classId: "c1", sessionDate: "2026-11-02" },
    };
    expect(planMigration("subjectAttendance", [row]).moves[0].to).toBe(
      "sa_s1_c1_2026-11-02",
    );
  });

  it("applies the read limit", () => {
    expect(withinBudget(5000, 5000)).toBe(true);
    expect(withinBudget(5001, 5000)).toBe(false);
  });
});

describe("the migration script", () => {
  it("is a dry run unless told otherwise, and needs one institution", () => {
    expect(scriptRaw).toContain("live: false");
    expect(scriptRaw).toContain("if (live) {");
    expect(scriptRaw).toContain("--institution is required");
  });

  it("never overwrites, and never loses a save made during the run", () => {
    expect(logicRaw).toContain("batch.create(");
    expect(logicRaw).toContain("{ lastUpdateTime: snapshot.updateTime }");
    expect(logicRaw).not.toContain("batch.set(");
  });

  it("checks the read limit before reading", () => {
    expect(scriptRaw.indexOf("withinBudget(total")).toBeLessThan(
      scriptRaw.indexOf("results.push(await migrateCollection"),
    );
  });
});
