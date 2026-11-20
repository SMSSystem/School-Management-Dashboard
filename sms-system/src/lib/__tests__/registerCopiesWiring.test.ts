import { describe, expect, it } from "vitest";
import authSrc from "../AuthContext.tsx?raw";
import generalPage from "../../scenes/(dashboard)/attendance/general/index.tsx?raw";
import subjectPage from "../../scenes/(dashboard)/attendance/subject/index.tsx?raw";
import subjectReads from "../../hooks/useSubjectRegisterReads.ts?raw";
import generalReads from "../../hooks/useGeneralRegisterReads.ts?raw";
import registerReads from "../offline/registerReads.ts?raw";
import prefetchSrc from "../offline/prefetchRegisters.ts?raw";
import menuSrc from "../../components/Menu.tsx?raw";
import lazyPagesSrc from "../../routes/lazyPages.ts?raw";
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

  it("back online, both hooks read the students again once the server answers, so the copy notice goes", () => {
    for (const hook of [generalReads, subjectReads]) {
      expect(flat(hook)).toContain(
        flat(
          "if (fromServer && studentsOnCopy.current) setStudentsRetry((n) => n + 1);",
        ),
      );
      expect(flat(hook)).toContain(
        flat("studentsOnCopy.current = read.fromCopy;"),
      );
      expect(hook).toContain("institutionId, studentsRetry]);");
    }
  });

  it("the sidebar loads both register pages' code for staff who work offline, while online", () => {
    expect(flat(menuSrc)).toContain(
      flat(
        "if (worksOffline(role) && navigator.onLine !== false) preloadRegisterPages();",
      ),
    );
    expect(flat(lazyPagesSrc)).toContain(
      flat(
        "for (const loader of [load.GeneralAttendanceRegisterPage, load.SubjectAttendancePage]) {",
      ),
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
