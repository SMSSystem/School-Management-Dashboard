import { describe, expect, it } from "vitest";
import {
  parseOrphanArgs,
  summariseOrphan,
  totalOrphans,
} from "../../../scripts/pruneOrphanSubmissionsLogic.mjs";
import scriptRaw from "../../../scripts/prune-orphan-submissions.mjs?raw";

// scripts/prune-orphan-submissions.mjs: removes the submissions, attempts and tombstones left under assignments that
// were deleted before the app's delete cascade. Dry run by default; grades are never touched.

const script = scriptRaw.split("\r\n").join("\n");

describe("parseOrphanArgs", () => {
  it("is a dry run for every institution by default", () => {
    expect(parseOrphanArgs([])).toEqual({
      opts: { keyPath: null, institution: null, live: false },
    });
  });

  it("reads each flag", () => {
    expect(
      parseOrphanArgs(["--key=k.json", "--institution=abc", "--live"]),
    ).toEqual({
      opts: { keyPath: "k.json", institution: "abc", live: true },
    });
  });

  it("asks for help, and refuses an unknown flag or a path as an institution", () => {
    expect(parseOrphanArgs(["-h"])).toEqual({ help: true });
    expect(parseOrphanArgs(["--apply"]).error).toMatch(/Unrecognized/);
    expect(parseOrphanArgs(["--institution=a/b"]).error).toMatch(
      /single institution id/,
    );
  });
});

describe("the totals", () => {
  it("sums one orphan's files, skipping missing or bad sizes", () => {
    expect(
      summariseOrphan({
        submissionSizes: [100, undefined],
        attemptSizes: [100, 50, -1],
        tombstones: 2,
      }),
    ).toEqual({
      submissions: 2,
      attempts: 3,
      tombstones: 2,
      bytes: 250,
    });
  });

  it("adds up many orphans", () => {
    const one = { submissions: 1, attempts: 2, tombstones: 1, bytes: 10 };
    expect(totalOrphans([one, one])).toEqual({
      assignments: 2,
      submissions: 2,
      attempts: 4,
      tombstones: 2,
      bytes: 20,
    });
    expect(totalOrphans([])).toEqual({
      assignments: 0,
      submissions: 0,
      attempts: 0,
      tombstones: 0,
      bytes: 0,
    });
  });
});

describe("the script", () => {
  it("deletes only with --live, and only assignment paths whose document is gone", () => {
    expect(script).toContain("if (opts.live) await db.recursiveDelete(ref);");
    expect(script).toContain(
      "return snaps.filter((s) => !s.exists).map((s) => s.ref);",
    );
    expect(script.match(/recursiveDelete|\.delete\(/g)).toHaveLength(1);
  });

  it("never touches the grades, and reads only file sizes, never the files", () => {
    expect(script).not.toMatch(/collection\(["'`]results|\/results/);
    expect(script).not.toMatch(/fileDataUrl"\)|get\("fileDataUrl/);
    expect(script).toContain('.select("fileSize").get()');
  });
});
