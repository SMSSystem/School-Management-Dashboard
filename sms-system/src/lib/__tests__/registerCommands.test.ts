import { describe, expect, it } from "vitest";
import {
  buildRegisterCommand,
  classify,
  expectedRecords,
  mergeCommands,
  resolveClashes,
} from "../offline/registerCommands";

// Register commands for the outbox (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C).

const P = { state: "present" };
const A = { state: "absent" };
const L = { state: "late" };
const E = { state: "excused", reason: "Clinic" };

describe("buildRegisterCommand", () => {
  it("holds only the students that changed, each with the value it was changed from", () => {
    expect(
      buildRegisterCommand({ s1: P, s2: A }, { s1: P, s2: L, s3: E }),
    ).toEqual({
      changes: { s2: L, s3: E },
      base: { s2: A, s3: null },
    });
  });

  it("clears a student taken off the register", () => {
    expect(buildRegisterCommand({ s1: P }, {})).toEqual({
      changes: { s1: null },
      base: { s1: P },
    });
  });

  it("compares with the queued changes, so changing a queued mark back is sent too", () => {
    const first = buildRegisterCommand({ s1: P }, { s1: A });
    const expected = expectedRecords({ s1: P }, [first]);
    expect(expected).toEqual({ s1: A });
    expect(buildRegisterCommand(expected, { s1: P })).toEqual({
      changes: { s1: P },
      base: { s1: A },
    });
  });
});

describe("mergeCommands", () => {
  it("keeps the newer change and the older base", () => {
    const merged = mergeCommands(
      { changes: { s1: A }, base: { s1: P } },
      { changes: { s1: L, s2: P }, base: { s1: A, s2: null } },
    );
    expect(merged).toEqual({
      changes: { s1: L, s2: P },
      base: { s1: P, s2: null },
    });
  });

  it("turns a mark changed and changed back into nothing to send", () => {
    const merged = mergeCommands(
      { changes: { s1: A }, base: { s1: P } },
      { changes: { s1: P }, base: { s1: A } },
    );
    expect(classify(merged, { s1: P })).toEqual({ apply: {}, clash: {} });
  });
});

describe("classify", () => {
  const command = {
    changes: { s1: A, s2: L, s3: P, s4: null },
    base: { s1: P, s2: P, s3: null, s4: E },
  };

  it("applies a student still as it was, skips one already as wanted, and flags one someone else changed", () => {
    expect(classify(command, { s1: P, s2: A, s3: P, s4: E })).toEqual({
      apply: { s1: A, s4: null },
      clash: { s2: { mine: L, theirs: A } },
    });
  });

  it("applies everything to a register that doesn't exist yet when nothing was there before", () => {
    expect(
      classify({ changes: { s1: P }, base: { s1: null } }, undefined),
    ).toEqual({ apply: { s1: P }, clash: {} });
  });

  it("treats a changed excuse reason as a change", () => {
    expect(
      classify(
        {
          changes: { s1: E },
          base: { s1: { state: "excused", reason: "Other" } },
        },
        { s1: { state: "excused", reason: "Sick" } },
      ).clash,
    ).toEqual({
      s1: { mine: E, theirs: { state: "excused", reason: "Sick" } },
    });
  });
});

describe("resolveClashes", () => {
  it("sends mine again over theirs, and drops the ones kept as theirs", () => {
    const clash = { s1: { mine: A, theirs: P }, s2: { mine: L, theirs: null } };
    const command = resolveClashes(clash, { s1: "mine", s2: "theirs" });
    expect(command).toEqual({ changes: { s1: A }, base: { s1: P } });
    expect(classify(command, { s1: P }).apply).toEqual({ s1: A });
  });
});
