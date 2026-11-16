import { describe, expect, it } from "vitest";
import {
  FILE_TYPES,
  SOFT_SCHOOL_FILE_LIMIT,
  fileType,
  formatBytes,
  parseReportArgs,
  summariseRubrics,
} from "../../../scripts/rubricFileReportLogic.mjs";
import scriptRaw from "../../../scripts/rubric-file-report.mjs?raw";
import logicRaw from "../../../scripts/rubricFileReportLogic.mjs?raw";
import {
  RUBRIC_MIME_TYPES,
  SOFT_SCHOOL_FILE_LIMIT as APP_SOFT_LIMIT,
} from "../rubricFileKinds";

// scripts/rubric-file-report.mjs: each school's rubric files, by count, size and type
// (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 12.4).

const pdf = (size: number) => ({ size, mimeType: "application/pdf" });

describe("summariseRubrics", () => {
  it("counts rubrics, files, total and largest size, and types", () => {
    const s = summariseRubrics([
      pdf(1000),
      undefined,
      { size: 3000, mimeType: RUBRIC_MIME_TYPES.sheet },
      pdf(500),
    ]);
    expect(s).toMatchObject({
      rubrics: 4,
      withFile: 3,
      totalBytes: 4500,
      largestBytes: 3000,
      overSoftLimit: false,
    });
    expect(s.byType).toEqual({ PDF: 2, Excel: 1 });
  });

  it("counts a file with no usable size, without adding to the size", () => {
    const s = summariseRubrics([
      { mimeType: "text/csv" },
      { size: -5, mimeType: "text/csv" },
    ]);
    expect(s).toMatchObject({ withFile: 2, totalBytes: 0, largestBytes: 0 });
    expect(s.byType).toEqual({ CSV: 2 });
  });

  it("flags a school over the soft limit", () => {
    const files = Array.from({ length: SOFT_SCHOOL_FILE_LIMIT + 1 }, () =>
      pdf(1),
    );
    expect(summariseRubrics(files).overSoftLimit).toBe(true);
    expect(summariseRubrics(files.slice(1)).overSoftLimit).toBe(false);
  });

  it("returns counts only, never titles or names", () => {
    expect(Object.keys(summariseRubrics([pdf(1)])).sort()).toEqual([
      "byType",
      "largestBytes",
      "overSoftLimit",
      "rubrics",
      "shareOfSoftLimit",
      "totalBytes",
      "withFile",
    ]);
  });
});

describe("the file types and limit", () => {
  it("match the app's", () => {
    expect(SOFT_SCHOOL_FILE_LIMIT).toBe(APP_SOFT_LIMIT);
    expect(Object.keys(FILE_TYPES).sort()).toEqual(
      Object.values(RUBRIC_MIME_TYPES).sort(),
    );
  });

  it("name anything else Other", () => {
    expect(fileType("image/png")).toBe("Other");
    expect(fileType(undefined)).toBe("Other");
  });

  it("print sizes as KB or MB", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("parseReportArgs", () => {
  it("counts only by default, for every institution", () => {
    expect(parseReportArgs([], 5000)).toEqual({
      opts: { keyPath: null, institution: null, read: false, maxReads: 5000 },
    });
  });

  it("reads each flag", () => {
    expect(
      parseReportArgs(
        ["--key=k.json", "--institution=abc_1", "--read", "--max-reads=20"],
        5000,
      ),
    ).toEqual({
      opts: {
        keyPath: "k.json",
        institution: "abc_1",
        read: true,
        maxReads: 20,
      },
    });
  });

  it("asks for help", () => {
    expect(parseReportArgs(["--read", "-h"], 5000)).toEqual({ help: true });
  });

  it("refuses an unknown flag, a path as an institution and a bad read limit", () => {
    expect(parseReportArgs(["--live"], 5000).error).toMatch(/Unrecognized/);
    expect(parseReportArgs(["--institution=a/b"], 5000).error).toMatch(
      /single institution id/,
    );
    expect(parseReportArgs(["--max-reads=0"], 5000).error).toMatch(
      /whole number/,
    );
    expect(parseReportArgs(["--max-reads=x"], 5000).error).toMatch(
      /whole number/,
    );
  });
});

describe("the script", () => {
  it("never writes to Firestore", () => {
    for (const source of [scriptRaw, logicRaw]) {
      expect(source).not.toMatch(
        /\.(set|update|delete|create|add)\(|recursiveDelete|batch\(|runTransaction/,
      );
    }
  });

  it("reads only each rubric's file field, never the stored files", () => {
    expect(scriptRaw).toContain('.select("file").get()');
    expect(scriptRaw).not.toMatch(
      /collection\(["']file["']\)|doc\(["']current["']\)|collectionGroup\(/,
    );
  });

  it("only reads with --read, and only counts without it", () => {
    expect(scriptRaw).toContain("if (!opts.read) {");
    expect(scriptRaw).toContain(".count().get()");
  });
});
