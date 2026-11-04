import { QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { invalidateUserLists } from "../invalidateUserCounts";
import { LIST_STALE_MS } from "../queryPolicies";
import { queryClient } from "../queryClient";
import { createUserFormSource as createUserSrc } from "./createUserFormSource";
import { importSource as importSrc } from "./importSource";

// A list of people is cached for LIST_STALE_MS. An account created in that window has to reach the list anyway:
// the person who created it goes straight to the list and expects to see it (issue #82).

const INVALIDATED = (key: unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated;

/** Opens the list as a page would, waits for its data, closes it, and returns what the page was given. */
async function visitList(
  key: unknown[],
  read: () => string[],
): Promise<string[] | undefined> {
  const observer = new QueryObserver<string[]>(queryClient, {
    queryKey: key,
    queryFn: read,
    staleTime: LIST_STALE_MS,
  });
  const stop = observer.subscribe(() => {});
  await queryClient.getQueryCache().find({ queryKey: key })?.promise;
  const { data } = observer.getCurrentResult();
  stop();
  return data;
}

describe("invalidateUserLists", () => {
  afterEach(() => queryClient.clear());

  it("shows a new account on the next visit to the list, inside the cache window", async () => {
    const key = ["users", "inst1"];
    const stored = ["existing"];
    let reads = 0;
    const read = () => {
      reads += 1;
      return [...stored];
    };

    expect(await visitList(key, read)).toEqual(["existing"]);

    stored.push("created");
    expect(await visitList(key, read)).toEqual(["existing"]); // the bug: without the call, the cached list is served
    expect(reads).toBe(1);

    invalidateUserLists();
    expect(await visitList(key, read)).toEqual(["existing", "created"]);
    expect(reads).toBe(2);
  });

  it("costs one read however many accounts were created while the list was closed", async () => {
    const key = ["users", "inst1"];
    let reads = 0;
    const read = () => {
      reads += 1;
      return [];
    };
    await visitList(key, read);

    invalidateUserLists();
    invalidateUserLists();
    invalidateUserLists();
    expect(reads).toBe(1);

    await visitList(key, read);
    expect(reads).toBe(2);
  });

  it("covers the shared list, a teacher's students-only list and a class's students", () => {
    const keys = [
      ["users", "inst1"],
      ["users", "inst1", "students"],
      ["classStudents", "inst1", "class1"],
      ["users", "inst2"],
    ];
    for (const key of keys) queryClient.setQueryData(key, []);

    invalidateUserLists();

    for (const key of keys) expect(INVALIDATED(key)).toBe(true);
  });

  it("with an institution id leaves other institutions and other data alone", () => {
    queryClient.setQueryData(["users", "inst1"], []);
    queryClient.setQueryData(["users", "inst2"], []);
    queryClient.setQueryData(["classes", "inst1"], []);

    invalidateUserLists("inst1");

    expect(INVALIDATED(["users", "inst1"])).toBe(true);
    expect(INVALIDATED(["users", "inst2"])).toBe(false);
    expect(INVALIDATED(["classes", "inst1"])).toBe(false);
  });
});

describe("the paths that create accounts", () => {
  it("refresh the lists of people", () => {
    expect(createUserSrc).toContain("invalidateUserLists();");
    expect(importSrc).toContain(
      "invalidateUserLists(); // and the lists of people",
    );
  });
});
