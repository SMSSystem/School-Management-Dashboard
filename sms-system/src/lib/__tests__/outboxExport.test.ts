import { describe, expect, it } from "vitest";
import {
  OUTBOX_EXPORT_COLUMNS,
  clashNameOf,
  needsAttention,
  statusLabel,
  outboxExportFilename,
  outboxExportRows,
  registerLabel,
} from "../offline/outboxExport";
import { rowsToCSV } from "../spreadsheetExport";
import {
  signInNotice,
  signOutDetail,
  signOutWarning,
  unsentButtonName,
  unsentLabel,
} from "../offline/copyLabels";
import type { OutboxItem } from "../offline/outboxStore";

// Exporting unsent register saves, and the wording around them (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md,
// slice C2).

const general = {
  opId: "a",
  state: "pending",
  attempts: 0,
  createdAt: Date.UTC(2026, 10, 20, 9, 30),
  expiresAt: 0,
  nextAttemptAt: 0,
  payload: {
    kind: "register.general",
    fields: { className: "Form 2A", date: "2026-11-20", session: "AM" },
    command: {
      changes: {
        s1: { state: "A", reason: "=Sick", studentName: "Ann Lee" },
        s2: null,
      },
      base: { s1: { state: "P" }, s2: { state: "L", studentName: "Bo Roe" } },
    },
  },
} as unknown as OutboxItem;

const subject = {
  ...general,
  opId: "b",
  state: "refused",
  payload: {
    ...general.payload,
    kind: "register.subject",
    fields: {
      subjectName: "Maths",
      className: "Form 2A",
      sessionDate: "2026-11-21",
    },
    command: { changes: { s3: { state: "P" } }, base: { s3: null } },
  },
} as unknown as OutboxItem;

describe("registerLabel", () => {
  it("names a general register by class, date and session, and a subject register by subject", () => {
    expect(registerLabel(general)).toBe("General, Form 2A, 2026-11-20, AM");
    expect(registerLabel(subject)).toBe("Maths, Form 2A, 2026-11-21");
  });
});

describe("outboxExportRows", () => {
  it("gives one row per student change, with the previous mark and a cleared mark", () => {
    const rows = outboxExportRows([general, subject]);
    expect(rows).toEqual([
      {
        register: "General, Form 2A, 2026-11-20, AM",
        student: "Ann Lee",
        mark: "Absent",
        reason: "=Sick",
        was: "Present",
        queuedAt: "2026-11-20T09:30:00.000Z",
        state: "pending",
      },
      expect.objectContaining({
        student: "Bo Roe",
        mark: "No mark",
        was: "Late",
      }),
      expect.objectContaining({
        register: "Maths, Form 2A, 2026-11-21",
        student: "s3",
        mark: "Present",
        was: "No mark",
        state: "refused",
      }),
    ]);
  });

  it("keeps a typed reason that looks like a formula as text in the CSV", () => {
    const csv = rowsToCSV(outboxExportRows([general]), OUTBOX_EXPORT_COLUMNS);
    expect(csv.split("\n")[0]).toBe(
      '"Register","Student","Mark","Reason","Previous mark","Queued at (UTC)","State"',
    );
    expect(csv).toContain(`"'=Sick"`);
  });

  it("names the file by date only", () => {
    expect(outboxExportFilename(Date.UTC(2026, 10, 20, 23))).toBe(
      "unsent-attendance-2026-11-20.csv",
    );
  });
});

describe("wording", () => {
  it("counts registers and saves in plain words", () => {
    expect(unsentLabel(2)).toBe("2 unsent");
    expect(signOutWarning(1)).toBe("1 register hasn't been sent yet.");
    expect(signOutWarning(3)).toBe("3 registers haven't been sent yet.");
    expect(signOutDetail(1)).toMatch(/^It stays .* and is sent/);
    expect(signOutDetail(2)).toMatch(/^They stay .* and are sent/);
    expect(unsentButtonName(1)).toBe("1 unsent attendance register");
    expect(unsentButtonName(4)).toBe("4 unsent attendance registers");
    expect(signInNotice(1, true)).toBe(
      "1 register save from your last session is being sent.",
    );
    expect(signInNotice(2, false)).toBe(
      "2 register saves from your last session are waiting on this device. Sending is turned off for your school.",
    );
  });
});

describe("statusLabel and needsAttention", () => {
  const at = (state: string, extra: object = {}) =>
    ({ ...general, state, expiresAt: 100, ...extra }) as OutboxItem;

  it("says where each item stands, and which need the person", () => {
    expect(statusLabel(at("pending"), 50)).toBe("Waiting to send.");
    expect(statusLabel(at("sending"), 50)).toBe("Sending…");
    expect(statusLabel(at("pending"), 100)).toBe("Not sent within 7 days.");
    expect(
      statusLabel(
        at("refused", {
          payload: { ...general.payload, refusedReason: "No access." },
        }),
        50,
      ),
    ).toBe("Not accepted. No access.");
    expect(needsAttention(at("pending"), 50)).toBe(false);
    expect(needsAttention(at("pending"), 100)).toBe(true);
    expect(needsAttention(at("conflict"), 50)).toBe(true);
  });

  it("names clashing students from their marks", () => {
    const item = at("conflict", {
      payload: {
        ...general.payload,
        clash: {
          s1: { mine: null, theirs: { state: "P", studentName: "Cy" } },
        },
      },
    });
    expect(clashNameOf(item)("s1")).toBe("Cy");
    expect(clashNameOf(item)("s9")).toBe("s9");
  });
});
