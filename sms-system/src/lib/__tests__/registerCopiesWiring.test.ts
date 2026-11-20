import { describe, expect, it } from "vitest";
import authSrc from "../AuthContext.tsx?raw";
import generalPage from "../../scenes/(dashboard)/attendance/general/index.tsx?raw";
import subjectPage from "../../scenes/(dashboard)/attendance/subject/index.tsx?raw";
import subjectReads from "../../hooks/useSubjectRegisterReads.ts?raw";
import generalReads from "../../hooks/useGeneralRegisterReads.ts?raw";
import registerReads from "../offline/registerReads.ts?raw";
import prefetchSrc from "../offline/prefetchRegisters.ts?raw";
import { flat } from "./sourceText";

// Register working copies (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice B): both register pages read
// through the working-copy hooks, show when they're on a copy, and teachers get today's registers in advance.

describe("register working copies", () => {
  it("both pages read their students and week through the working-copy hooks, and show the copy notice", () => {
    expect(flat(generalPage)).toContain(
      flat(
        "useGeneralRegisterReads(institutionId, effectiveClassId, weekDates[0], weekEnd)",
      ),
    );
    expect(flat(subjectPage)).toContain(
      flat(
        "const { enrolledStudents, savedDocs, copySavedAt } = useSubjectRegisterReads(",
      ),
    );
    for (const page of [generalPage, subjectPage]) {
      expect(page).toContain("<CopyNotice savedAt={copySavedAt} />");
      expect(page).not.toMatch(/(?<![\w.])onSnapshot\(/);
    }
  });

  it("the hooks listen through watchRegisters, which keeps only server answers", () => {
    expect(generalReads).toContain("watchRegisters(");
    expect(subjectReads).toContain("watchRegisters(");
    const src = flat(registerReads);
    expect(src).toContain(flat("{ includeMetadataChanges: true }"));
    expect(src).toContain(
      flat("if (!snap.metadata.hasPendingWrites) keepCopy(week.name, value);"),
    );
  });

  it("an online staff start prefetches today's registers, loaded on demand", () => {
    expect(flat(authSrc)).toContain(
      flat("void import('./offline/prefetchRegisters')"),
    );
    expect(flat(prefetchSrc)).toContain(
      flat("todaysSubjectClasses(subjects, today)"),
    );
    expect(flat(prefetchSrc)).toContain(
      flat(
        'if (role !== "senior_teacher" && role !== "regular_teacher") return;',
      ),
    );
  });
});
