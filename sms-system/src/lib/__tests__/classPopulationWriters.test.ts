import { describe, expect, it } from "vitest";

// The class head-counts (lib/classPopulationDelta.ts) are kept by the batches that change a student. A writer that
// changes a student's classes, gender or status and forgets to move the counts would silently drift them, so this
// scans every source file for a write to a user document that sets one of those fields and fails unless the file is
// a known writer: either it moves the counts (it must call populationDelta and addPopulationDelta), or it is
// exempt with a reason. A new writer has to be added here on purpose.

// Fallow would count this raw-text glob as importing every file, so this test is in ignorePatterns in .fallowrc.json.
const sources = import.meta.glob("../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const lf = (s: string) => s.split("\r\n").join("\n");

const WRITES_A_USER =
  /(?:batch|last|b)\.(?:set|update)\(\s*doc\(\s*db\s*,\s*['"]users['"]|(?:updateDoc|setDoc)\(\s*doc\(\s*db\s*,\s*['"]users['"]/;
const SETS_A_COUNTED_FIELD = /\b(classIds|classId|gender|status)\s*:/;

/** Writers that move the head-counts in the same batch. */
const COUNTED = [
  "lib/createUserAccount.ts",
  "lib/importStudentsCommit.ts",
  "lib/deleteUserExecutor.ts",
  "components/forms/StudentForm.tsx",
  "components/AccountStatusToggle.tsx",
  "scenes/(dashboard)/list/classes/[id]/index.tsx",
  // saveOne gives a student a home class in the same batch as its head-count increments
  "scenes/(dashboard)/admin/backfill-student-classes/index.tsx",
];

/** Files that match the scan but do not change who is counted in a class, and why. */
const EXEMPT: Record<string, string> = {
  "lib/classDeletion.ts":
    "removes a DELETED class from other students’ lists; that class document is gone, and no other class changes",
  "scenes/(dashboard)/list/houses/[id]/index.tsx":
    "writes houseId and houseName only (its classId is a filter label)",
  "components/SendLoginEmailButton.tsx":
    "writes the credentials-emailed stamp (its status is the email send status, not the account status)",
};

// Vite names a glob match relative to this file: '../x.ts' for a file in src/lib, '../../components/y.tsx' elsewhere.
const relative = (path: string) =>
  path.startsWith("../../")
    ? path.slice(6)
    : path.startsWith("../")
      ? `lib/${path.slice(3)}`
      : path;

describe("class head-count writers", () => {
  const matches = Object.entries(sources)
    .filter(
      ([path]) => !path.includes("__tests__") && !/\.test\.tsx?$/.test(path),
    )
    .filter(
      ([, text]) =>
        WRITES_A_USER.test(lf(text)) && SETS_A_COUNTED_FIELD.test(lf(text)),
    )
    .map(([path]) => relative(path))
    .sort();

  it("every file that writes classes, gender or status on a user is a known writer or exempt", () => {
    const unknown = matches.filter(
      (p) => !COUNTED.includes(p) && !(p in EXEMPT),
    );
    expect(unknown).toEqual([]);
  });

  it("the exempt list holds no file that has stopped matching, so it does not grow stale", () => {
    expect(Object.keys(EXEMPT).filter((p) => !matches.includes(p))).toEqual([]);
  });

  it.each(COUNTED)(
    "%s moves the head-counts with populationDelta and addPopulationDelta",
    (file) => {
      const entry = Object.entries(sources).find(
        ([path]) => relative(path) === file,
      );
      expect(entry, file).toBeDefined();
      const src = lf(entry![1]);
      expect(src).toContain("populationDelta(");
      expect(src).toContain("addPopulationDelta(");
    },
  );
});

describe("where each writer gets the student as they are now", () => {
  const get = (file: string) =>
    lf(Object.entries(sources).find(([path]) => relative(path) === file)![1]);

  it("Edit student, Deactivate and Delete read the stored student first, not the list row", () => {
    expect(get("components/forms/StudentForm.tsx")).toContain(
      'const storedStudent = await getDoc(doc(db, "users", uid));',
    );
    expect(get("components/AccountStatusToggle.tsx")).toContain(
      'const stored = (await getDoc(doc(db, "users", uid))).data();',
    );
    expect(get("lib/deleteUserExecutor.ts")).toContain(
      "const stored = (await getDoc(doc(db, 'users', p.uid))).data();",
    );
  });

  it("Backfill Classes reads the student fresh and moves the counts in the one batch that gives them a home class", () => {
    const src = get(
      "scenes/(dashboard)/admin/backfill-student-classes/index.tsx",
    );
    const save = src.slice(
      src.indexOf("async function saveOne("),
      src.indexOf("async function saveAll("),
    );
    expect(save).toContain(
      "const stored = (await getDoc(doc(db, 'users', uid))).data() ?? {};",
    );
    expect(save).not.toContain("updateDoc(");
    expect(save.indexOf("addPopulationDelta(")).toBeGreaterThan(
      save.indexOf("batch.update(doc(db, 'users', uid)"),
    );
    expect(save.indexOf("addPopulationDelta(")).toBeLessThan(
      save.indexOf("await batch.commit();"),
    );
    // a refused read is reported, not swallowed into an empty page
    expect(src).toContain(".catch(onLoadError('the students and classes'))");
    expect(src).not.toContain(".catch(() => {})");
  });

  it("a new student has no earlier state: create and import pass null as the before side", () => {
    expect(get("lib/createUserAccount.ts")).toMatch(
      /populationDelta\(\s*null,/,
    );
    expect(get("lib/importStudentsCommit.ts")).toMatch(
      /populationDelta\(\s*null,/,
    );
  });

  it("the delete moves the counts in the last batch, with the user document", () => {
    const src = get("lib/deleteUserExecutor.ts");
    const last = src.indexOf("last.delete(doc(db, 'users', p.uid));");
    expect(last).toBeGreaterThan(-1);
    expect(src.indexOf("addPopulationDelta(", last)).toBeGreaterThan(last);
    expect(src.indexOf("addPopulationDelta(", last)).toBeLessThan(
      src.indexOf("await last.commit();"),
    );
  });

  it("only students move the counts: the toggle takes a student flag and create checks the role", () => {
    expect(get("components/AccountStatusToggle.tsx")).toContain(
      'if (student && institutionId !== "*") {',
    );
    expect(get("lib/createUserAccount.ts")).toContain(
      'if (values.role === "student") {',
    );
    expect(get("lib/deleteUserExecutor.ts")).toContain(
      "if (p.role === 'student') {",
    );
    expect(get("scenes/(dashboard)/list/students/index.tsx")).toContain(
      "institutionId={item.institutionId} student />",
    );
  });
});
