import { describe, expect, it } from "vitest";
import {
  classifySendError,
  dueItems,
  isExpired,
  nextWake,
  quotaResetsAt,
  sentDrafts,
  retryDelay,
} from "../offline/outboxPolicy";
import type { OutboxItem } from "../offline/outboxStore";

// When the outbox sender tries again (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C).

const err = (code: string) => Object.assign(new Error(code), { code });

describe("classifySendError", () => {
  it("retries a dropped connection or a timeout, however often", () => {
    for (const code of [
      "unavailable",
      "deadline-exceeded",
      "",
      "firestore/unavailable",
    ]) {
      expect(classifySendError(err(code), 9)).toEqual({ action: "retry" });
    }
    expect(classifySendError(new TypeError("Failed to fetch"), 9)).toEqual({
      action: "retry",
    });
  });

  it("waits for sign-in, and holds everything when the daily quota runs out", () => {
    expect(classifySendError(err("unauthenticated"), 1).action).toBe(
      "wait-for-sign-in",
    );
    expect(classifySendError(err("resource-exhausted"), 1).action).toBe(
      "hold-until-quota-resets",
    );
  });

  it("retries a refusal a few times, since App Check hiccups look the same, then refuses", () => {
    expect(classifySendError(err("permission-denied"), 2).action).toBe("retry");
    expect(classifySendError(err("permission-denied"), 3)).toMatchObject({
      action: "refuse",
    });
    expect(classifySendError(err("aborted"), 3)).toMatchObject({
      action: "refuse",
    });
  });

  it("refuses a bad request at once", () => {
    expect(classifySendError(err("invalid-argument"), 1)).toMatchObject({
      action: "refuse",
    });
  });
});

describe("retryDelay", () => {
  it("doubles from 5 seconds up to 5 minutes, spread by jitter", () => {
    expect(retryDelay(1, () => 0.5)).toBe(5_000);
    expect(retryDelay(3, () => 0.5)).toBe(20_000);
    expect(retryDelay(20, () => 0.5)).toBe(300_000);
    expect(retryDelay(1, () => 0)).toBe(3_500);
    expect(retryDelay(1, () => 1)).toBe(6_500);
  });
});

describe("quotaResetsAt", () => {
  it("is the next 08:00 UTC", () => {
    expect(
      new Date(quotaResetsAt(Date.UTC(2026, 10, 20, 7, 59))).toISOString(),
    ).toBe("2026-11-20T08:00:00.000Z");
    expect(
      new Date(quotaResetsAt(Date.UTC(2026, 10, 20, 8, 0))).toISOString(),
    ).toBe("2026-11-21T08:00:00.000Z");
  });
});

const item = (
  opId: string,
  targetKey: string,
  createdAt: number,
  state: OutboxItem["state"] = "pending",
  nextAttemptAt = 0,
  expiresAt = Number.POSITIVE_INFINITY,
): OutboxItem =>
  ({
    opId,
    state,
    attempts: 0,
    createdAt,
    expiresAt,
    nextAttemptAt,
    payload: { targetKey },
  }) as OutboxItem;

describe("dueItems", () => {
  it("takes each register's oldest waiting item, so one person's saves land in order", () => {
    const due = dueItems(
      [
        item("b2", "B", 4),
        item("a1", "A", 1),
        item("b1", "B", 2),
        item("a2", "A", 3),
      ],
      10,
    );
    expect(due.map((i) => i.opId)).toEqual(["a1", "b1"]);
  });

  it("lets a later item through when the register's earlier one waits for a choice or was refused", () => {
    const due = dueItems(
      [
        item("a1", "A", 1, "conflict"),
        item("a2", "A", 2),
        item("b1", "B", 3, "refused"),
      ],
      10,
    );
    expect(due.map((i) => i.opId)).toEqual(["a2"]);
  });

  it("waits until an item's next try is due, and treats one left sending by a closed tab as waiting", () => {
    expect(dueItems([item("a1", "A", 1, "pending", 50)], 10)).toEqual([]);
    expect(
      dueItems([item("a1", "A", 1, "sending")], 10).map((i) => i.opId),
    ).toEqual(["a1"]);
  });
});

describe("expiry", () => {
  it("is reached at expiresAt", () => {
    expect(isExpired(item("a", "A", 1, "pending", 0, 100), 99)).toBe(false);
    expect(isExpired(item("a", "A", 1, "pending", 0, 100), 100)).toBe(true);
  });

  it("stops an expired item sending on its own, and holds its register behind it", () => {
    const items = [
      item("a1", "A", 1, "pending", 0, 5),
      item("a2", "A", 2),
      item("b1", "B", 3),
    ];
    expect(dueItems(items, 10).map((i) => i.opId)).toEqual(["b1"]);
    expect(nextWake([item("a1", "A", 1, "pending", 20, 5)], 10)).toBeNull();
  });
});

describe("nextWake", () => {
  it("is the soonest waiting item's next try, or nothing", () => {
    expect(
      nextWake(
        [item("a", "A", 1, "pending", 90), item("b", "B", 1, "pending", 40)],
        10,
      ),
    ).toBe(40);
    expect(nextWake([item("a", "A", 1, "conflict", 5)], 10)).toBeNull();
  });
});

describe("sentDrafts", () => {
  it("clears a draft once its register has no outbox item left, and keeps one still waiting or in conflict", () => {
    const watched = new Map([
      ["A", { draftKey: "a", snapshot: "1" }],
      ["B", { draftKey: "b", snapshot: "2" }],
      ["C", { draftKey: "c", snapshot: "3" }],
    ]);
    const cleared = sentDrafts(watched, [
      item("b1", "B", 1),
      item("c1", "C", 1, "conflict"),
    ]);
    expect(cleared).toEqual([{ draftKey: "a", snapshot: "1" }]);
    expect([...watched.keys()]).toEqual(["B", "C"]);
    expect(sentDrafts(watched, [])).toHaveLength(2);
    expect(watched.size).toBe(0);
  });
});
