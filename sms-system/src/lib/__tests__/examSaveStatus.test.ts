import { describe, expect, it } from "vitest";
import { formatExamClock } from "../examDateTime";
import {
  EXTRA_TIME_TEXT,
  FAILED_TEXT,
  NOT_SAVED_TEXT,
  OFFLINE_TEXT,
  saveRole,
  saveStateOfError,
  saveText,
  visibleSaveText,
  type SaveState,
} from "../examSaveStatus";
import runningRaw from "../../hooks/useRunningAttempt.ts?raw";

// What the attempt screen says about saving, and what the carousel layout shows of it.

const AT = Date.UTC(2026, 9, 26, 15, 42);
const states: SaveState[] = [
  { kind: "none" },
  { kind: "saving" },
  { kind: "saved", at: AT },
  { kind: "offline" },
  { kind: "failed" },
  { kind: "extra_time" },
];

describe("the words for each state", () => {
  it("are the ones the attempt screen has always used", () => {
    expect(saveText({ kind: "none" })).toBe("Not saved to the server yet");
    expect(saveText({ kind: "failed" })).toBe(FAILED_TEXT);
    expect(FAILED_TEXT).toContain("keeps trying");
    expect(saveText({ kind: "saving" })).toBe("Saving…");
    expect(saveText({ kind: "saved", at: AT })).toBe(
      `Saved at ${formatExamClock(AT)}`,
    );
    expect(saveText({ kind: "offline" })).toBe(OFFLINE_TEXT);
    expect(saveText({ kind: "extra_time" })).toBe(EXTRA_TIME_TEXT);
  });

  it("are the only place the words live: the running attempt keeps a state, not a sentence", () => {
    const hook = runningRaw.split("\r\n").join("\n");
    for (const text of [
      NOT_SAVED_TEXT,
      FAILED_TEXT,
      OFFLINE_TEXT,
      EXTRA_TIME_TEXT,
      "Saving…",
    ])
      expect(hook).not.toContain(text);
    expect(hook).toContain('useState<SaveState>({ kind: "none" })');
    expect(hook).toContain('setSaveState({ kind: "saving" });');
    expect(hook).toContain('setSaveState({ kind: "saved", at: Date.now() });');
    expect(hook).toContain(
      "setSaveState(saveStateOfError(classifyAttemptWrite(err)));",
    );
    expect(hook).toContain(
      'setSaveState((s) => (s.kind === "failed" || s.kind === "offline" ? s : { kind: "extra_time" }));',
    );
  });
});

describe("what each layout shows", () => {
  it('a computer shows every state but "nothing saved yet"', () => {
    for (const state of states) {
      expect(visibleSaveText(state, false)).toBe(
        state.kind === "none" ? null : saveText(state),
      );
    }
  });

  it('the carousel layout hides "nothing saved yet" and "Saving…"', () => {
    expect(visibleSaveText({ kind: "none" }, true)).toBeNull();
    expect(visibleSaveText({ kind: "saving" }, true)).toBeNull();
  });

  it("the carousel layout keeps saved, offline, failed and extra time", () => {
    expect(visibleSaveText({ kind: "saved", at: AT }, true)).toBe(
      `Saved at ${formatExamClock(AT)}`,
    );
    expect(visibleSaveText({ kind: "offline" }, true)).toBe(OFFLINE_TEXT);
    expect(visibleSaveText({ kind: "failed" }, true)).toBe(FAILED_TEXT);
    expect(visibleSaveText({ kind: "extra_time" }, true)).toBe(EXTRA_TIME_TEXT);
  });
});

describe("which states are spoken", () => {
  it("only problems are announced", () => {
    expect(states.map(saveRole)).toEqual([
      undefined,
      undefined,
      undefined,
      "status",
      "status",
      undefined,
    ]);
  });
});

describe("the state after a failed checkpoint", () => {
  it("is offline for a lost connection and failed for anything else", () => {
    expect(saveStateOfError("offline")).toEqual({ kind: "offline" });
    expect(saveStateOfError("other")).toEqual({ kind: "failed" });
    expect(saveStateOfError("too_late")).toEqual({ kind: "failed" });
  });
});
