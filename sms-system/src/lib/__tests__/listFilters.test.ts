import { describe, expect, it } from "vitest";
import {
  ALL,
  NONE,
  countLabel,
  filterStudentsByClass,
  filterSubjectsByTeacher,
  filterTeachersBySubject,
  housesWithClass,
  teacherOptions,
  validChoice,
} from "../listFilters";
import { naturalCompare, sortByNameNatural } from "../sortByName";
import studentsRaw from "../../scenes/(dashboard)/list/students/index.tsx?raw";
import teachersRaw from "../../scenes/(dashboard)/list/teachers/index.tsx?raw";
import subjectsRaw from "../../scenes/(dashboard)/list/subjects/index.tsx?raw";
import housesRaw from "../../scenes/(dashboard)/list/houses/index.tsx?raw";
import classesRaw from "../../scenes/(dashboard)/list/classes/index.tsx?raw";
import lessonNotesRaw from "../../scenes/(dashboard)/list/lesson-notes/index.tsx?raw";
import selectRaw from "../../components/FilterSelect.tsx?raw";
import parentsRaw from "../../scenes/(dashboard)/list/parents/index.tsx?raw";
import spectatorsRaw from "../../scenes/(dashboard)/list/spectators/index.tsx?raw";
import countRaw from "../../components/ResultCount.tsx?raw";
import subjectFilterRaw from "../../hooks/useSubjectFilter.ts?raw";
import chipsRaw from "../../components/SubjectFilterChips.tsx?raw";
import subjectBarRaw from "../../components/SubjectFilterBar.tsx?raw";
import assignmentsRaw from "../../scenes/(dashboard)/list/assignments/index.tsx?raw";
import examsRaw from "../../scenes/(dashboard)/list/exams/index.tsx?raw";
import studentExamsRaw from "../../components/exam/StudentExamList.tsx?raw";
import { flat } from "./sourceText";

// The dropdown filters and natural ordering on the list pages. The helpers are pure and
// tested directly; the pages are checked as source text (sort before slicing, the choice
// validated, the page reset, one shared Lesson Notes state), like the other page guards.

const norm = (s: string) => s.split("\r\n").join("\n");

describe("naturalCompare / sortByNameNatural", () => {
  it("orders numbers by value, ignores case, and puts digits before letters", () => {
    const names = [
      "10A",
      "2B",
      "1A",
      "art",
      "Biology",
      "3D Printing",
      "Zoology",
    ];
    expect(sortByNameNatural(names, (n) => n)).toEqual([
      "1A",
      "2B",
      "3D Printing",
      "10A",
      "art",
      "Biology",
      "Zoology",
    ]);
    expect(naturalCompare("Class 2", "Class 10")).toBeLessThan(0);
    expect(naturalCompare("abc", "ABC")).toBe(0);
  });

  it("returns a new array and leaves the input alone", () => {
    const input = ["b", "a"];
    expect(sortByNameNatural(input, (n) => n)).toEqual(["a", "b"]);
    expect(input).toEqual(["b", "a"]);
  });
});

describe("validChoice", () => {
  it("keeps All, None and a known id, and falls back to All for an id that is gone", () => {
    expect(validChoice(ALL, ["a"])).toBe(ALL);
    expect(validChoice(NONE, ["a"])).toBe(NONE);
    expect(validChoice("a", ["a", "b"])).toBe("a");
    expect(validChoice("gone", ["a", "b"])).toBe(ALL);
  });
});

describe("filterStudentsByClass", () => {
  const rows = [{ id: 1, classId: "c1" }, { id: 2, classId: "c2" }, { id: 3 }];

  it("filters by class, by no class, and passes everything for All", () => {
    expect(filterStudentsByClass(rows, ALL)).toHaveLength(3);
    expect(filterStudentsByClass(rows, "c1").map((r) => r.id)).toEqual([1]);
    expect(filterStudentsByClass(rows, NONE).map((r) => r.id)).toEqual([3]);
    expect(filterStudentsByClass(rows, "zzz")).toEqual([]);
  });

  it("also matches a student who is in the class as an additional class, and still their home class", () => {
    const students = [
      { id: 1, classId: "c1", classIds: ["c1", "c2"] }, // home c1, additional c2
      { id: 2, classId: "c2", classIds: ["c2"] },
      { id: 3, classId: "c1" }, // classIds not written yet
      { id: 4 },
    ];
    expect(filterStudentsByClass(students, "c2").map((r) => r.id)).toEqual([
      1, 2,
    ]);
    expect(filterStudentsByClass(students, "c1").map((r) => r.id)).toEqual([
      1, 3,
    ]);
    expect(filterStudentsByClass(students, NONE).map((r) => r.id)).toEqual([4]);
    expect(filterStudentsByClass(students, ALL)).toHaveLength(4);
  });
});

describe("teachers and subjects", () => {
  const subjects = [
    {
      id: "s1",
      name: "Math",
      teacherIds: ["t1", "t2"],
      teacherNames: ["Ann", "Bo"],
    },
    { id: "s2", name: "Art", teacherIds: ["t2"], teacherNames: ["Bo"] },
    { id: "s3", name: "Empty", teacherIds: [] },
    { id: "s4", name: "Legacy" },
  ];
  const teachers = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];

  it("lists the teachers on a subject, those on none, and everyone for All", () => {
    expect(filterTeachersBySubject(teachers, subjects, ALL)).toHaveLength(3);
    expect(
      filterTeachersBySubject(teachers, subjects, "s1").map((t) => t.id),
    ).toEqual(["t1", "t2"]);
    expect(
      filterTeachersBySubject(teachers, subjects, "s2").map((t) => t.id),
    ).toEqual(["t2"]);
    expect(
      filterTeachersBySubject(teachers, subjects, NONE).map((t) => t.id),
    ).toEqual(["t3"]);
    expect(filterTeachersBySubject(teachers, subjects, "gone")).toEqual([]);
  });

  it("lists the subjects of a teacher, those with no teacher (empty or missing), and all for All", () => {
    expect(filterSubjectsByTeacher(subjects, ALL)).toHaveLength(4);
    expect(filterSubjectsByTeacher(subjects, "t2").map((s) => s.id)).toEqual([
      "s1",
      "s2",
    ]);
    expect(filterSubjectsByTeacher(subjects, NONE).map((s) => s.id)).toEqual([
      "s3",
      "s4",
    ]);
  });

  it("builds the teacher options from the subjects: distinct, named, in natural order", () => {
    expect(teacherOptions(subjects)).toEqual([
      { id: "t1", name: "Ann" },
      { id: "t2", name: "Bo" },
    ]);
    expect(teacherOptions([{ id: "x", teacherIds: ["u"] }])).toEqual([
      { id: "u", name: "u" },
    ]);
    expect(teacherOptions([])).toEqual([]);
  });
});

describe("housesWithClass", () => {
  const houses = [{ id: "h1" }, { id: "h2" }, { id: "h3" }];
  const summaries = {
    h1: { classIds: ["c1", "c2"] },
    h2: { classIds: ["c2"] },
  };

  it("keeps houses with a student in the class; All keeps all; None keeps houses with no classes", () => {
    expect(housesWithClass(houses, summaries, ALL)).toHaveLength(3);
    expect(housesWithClass(houses, summaries, "c1").map((h) => h.id)).toEqual([
      "h1",
    ]);
    expect(housesWithClass(houses, summaries, "c2").map((h) => h.id)).toEqual([
      "h1",
      "h2",
    ]);
    expect(housesWithClass(houses, summaries, NONE).map((h) => h.id)).toEqual([
      "h3",
    ]);
  });
});

describe("the pages", () => {
  const students = norm(studentsRaw);
  const teachers = norm(teachersRaw);
  const subjects = norm(subjectsRaw);
  const houses = norm(housesRaw);
  const classes = norm(classesRaw);
  const lessons = norm(lessonNotesRaw);

  it("Students and Teachers filter, validate and remember their choice, and reset the page", () => {
    expect(students).toContain(
      "filterStudentsByClass(institutionFiltered, classFilter)",
    );
    expect(students).toContain('getPersistedFilter("students", "class")');
    expect(students).toContain('setPersistedFilter("students", "class", v);');
    expect(teachers).toContain(
      "filterTeachersBySubject(institutionFiltered, liveSubjects, subjectFilter)",
    );
    expect(teachers).toContain('getPersistedFilter("teachers", "subject")');
    for (const page of [students, teachers]) {
      expect(page).toContain("validChoice(");
      expect(page).toMatch(/setPersistedFilter\([^)]*\);\s*setPage\(1\);/);
    }
  });

  it("Subjects, Houses and Classes sort naturally BEFORE slicing, so the order holds across pages", () => {
    for (const page of [subjects, houses, classes]) {
      expect(page).toContain("sortByNameNatural(");
      expect(page.indexOf("sortByNameNatural(")).toBeLessThan(
        page.indexOf(".slice((page - 1) * PAGE_SIZE"),
      );
    }
    expect(subjects).toContain("filterSubjectsByTeacher(");
    expect(subjects).toContain('getPersistedFilter("subjects", "teacher")');
    expect(houses).toContain(
      "housesWithClass(houses, houseSummaries, classFilter)",
    );
    expect(houses).toContain("<Pagination total={shownHouses.length}");
    expect(houses).toContain('getPersistedFilter("houses", "class")');
  });

  it("Houses does not hide every house (or count 0) before the users list has loaded", () => {
    expect(houses).toContain("const classDataReady = users !== undefined;");
    expect(houses).toContain(
      "classDataReady ? housesWithClass(houses, houseSummaries, classFilter) : houses",
    );
    expect(houses).toContain(
      'loading={loading || (classFilter !== "" && !classDataReady)}',
    );
  });

  it("Lesson Notes, Assignments and Exams: the dropdown and the chips share one value, which is remembered", () => {
    const hook = flat(subjectFilterRaw);
    expect(hook).toContain(flat("getPersistedFilter(page, 'subject')"));
    expect(hook).toContain(flat("setPersistedFilter(page, 'subject', value);"));
    expect(hook).toContain(".sort(naturalCompare)");
    expect(hook).toContain(
      flat("const hasSubjectFilter = subjects.length > 1;"),
    );
    expect(flat(chipsRaw)).toContain(flat("onClick={() => onChange(s)}"));
    // Lesson Notes lays out its own dropdown and chips; the other lists share SubjectFilterBar.
    const flatLessons = flat(lessons);
    expect(flatLessons).toContain(flat('useSubjectFilter("lesson-notes",'));
    expect(flatLessons).toContain("value={activeSubject}");
    expect(flatLessons).toContain("onChange={setSubject}");
    expect(flatLessons).toContain(
      flat(
        "<SubjectFilterChips subjects={subjects} active={activeSubject} onChange={setSubject} />",
      ),
    );
    const bar = flat(subjectBarRaw);
    expect(bar).toContain("value={active}");
    expect(bar).toContain(
      flat(
        "<SubjectFilterChips subjects={subjects} active={active} onChange={onChange} />",
      ),
    );
    for (const [key, src] of [
      ["assignments", flat(assignmentsRaw)],
      ["exams", flat(examsRaw)],
      ["student-exams", flat(studentExamsRaw)],
    ]) {
      expect(src, key).toContain(flat(`useSubjectFilter("${key}",`));
      expect(src, key).toContain(
        flat(
          "<SubjectFilterBar subjects={subjects} active={activeSubject} onChange={setSubject}",
        ),
      );
      // Picking a subject goes back to page 1, and the filter runs before the page is sliced.
      expect(src, key).toContain(flat("setSubjectFilter(value); setPage(1);"));
      expect(src.indexOf("activeSubject ?"), key).toBeGreaterThan(-1);
      expect(src.indexOf("activeSubject ?")).toBeLessThan(
        src.lastIndexOf(".slice((page - 1) * PAGE_SIZE"),
      );
    }
  });

  it("Lesson Notes sorts A–Z before slicing, and the sort is remembered", () => {
    const src = flat(lessons);
    expect(src).toContain(flat('getPersistedFilter("lesson-notes", "sort")'));
    expect(src).toContain(
      flat(
        'sort === "az" ? sortByNameNatural(matching, (n) => n.name) : matching',
      ),
    );
    expect(src.indexOf("sortByNameNatural(matching")).toBeLessThan(
      src.indexOf(".slice((page - 1) * PAGE_SIZE"),
    );
  });

  it("the subject chips are hidden on a phone, where the dropdown does the job", () => {
    expect(norm(chipsRaw)).toContain(
      'className="hidden md:flex flex-wrap gap-2"',
    );
  });

  it("every dropdown is a labelled native select with an All option", () => {
    const select = norm(selectRaw);
    expect(select).toContain("aria-label={label}");
    expect(select).toContain("<option value={ALL}>{allLabel}</option>");
  });
});

describe("countLabel", () => {
  const base = {
    page: 1,
    pageSize: 20,
    singular: "student",
    plural: "students",
  };

  it('shows the page range, the matching total, and no "(N total)" when nothing narrows the list', () => {
    expect(countLabel({ ...base, matching: 42, total: 42 })).toBe(
      "Showing 1-20 of 42 students",
    );
    expect(countLabel({ ...base, matching: 42, total: 42, page: 2 })).toBe(
      "Showing 21-40 of 42 students",
    );
    expect(countLabel({ ...base, matching: 42, total: 42, page: 3 })).toBe(
      "Showing 41-42 of 42 students",
    );
    expect(countLabel({ ...base, matching: 12, total: 12 })).toBe(
      "Showing 1-12 of 12 students",
    );
  });

  it('adds "(N total)" once a dropdown or search narrows the list, and uses the singular for one row', () => {
    expect(countLabel({ ...base, matching: 42, total: 240, page: 2 })).toBe(
      "Showing 21-40 of 42 students (240 total)",
    );
    expect(countLabel({ ...base, matching: 1, total: 240 })).toBe(
      "Showing 1-1 of 1 student (240 total)",
    );
  });

  it("clamps a stale page to the last page instead of reading a range that does not exist", () => {
    expect(countLabel({ ...base, matching: 12, total: 12, page: 5 })).toBe(
      "Showing 1-12 of 12 students",
    );
    expect(countLabel({ ...base, matching: 42, total: 42, page: 0 })).toBe(
      "Showing 1-20 of 42 students",
    );
  });

  it("says why the table is empty, and what the unfiltered size is", () => {
    expect(countLabel({ ...base, matching: 0, total: 240 })).toBe(
      "No students match (240 total)",
    );
    expect(countLabel({ ...base, matching: 0, total: 0 })).toBe("No students");
  });

  it("shows an ellipsis while loading, never a misleading 0", () => {
    expect(countLabel({ ...base, matching: 0, total: 0, loading: true })).toBe(
      "\u2026",
    );
  });

  it("adds the cap note for Lesson Notes, alone or with the total", () => {
    const lessons = {
      ...base,
      singular: "lesson",
      plural: "lessons",
      capLimit: 100,
    };
    expect(countLabel({ ...lessons, matching: 37, total: 37 })).toBe(
      "Showing 1-20 of 37 lessons (newest 100 only)",
    );
    expect(countLabel({ ...lessons, matching: 37, total: 100 })).toBe(
      "Showing 1-20 of 37 lessons (100 total, newest 100 only)",
    );
  });
});

describe("the count on every list page", () => {
  const pages: [string, string, string][] = [
    [
      "students",
      norm(studentsRaw),
      "matching={filteredData.length} total={institutionFiltered.length}",
    ],
    [
      "teachers",
      norm(teachersRaw),
      "matching={filteredData.length} total={institutionFiltered.length}",
    ],
    [
      "subjects",
      norm(subjectsRaw),
      "matching={filteredData.length} total={institutionSubjects.length}",
    ],
    [
      "houses",
      norm(housesRaw),
      "matching={shownHouses.length} total={houses.length}",
    ],
    [
      "classes",
      norm(classesRaw),
      "matching={filteredData.length} total={institutionClasses.length}",
    ],
    [
      "parents",
      norm(parentsRaw),
      "matching={filteredData.length} total={institutionFiltered.length}",
    ],
    [
      "spectators",
      norm(spectatorsRaw),
      "matching={filtered.length} total={spectators.length}",
    ],
  ];

  it.each(pages)(
    "%s shows the count from the same list its pagination uses, and passes loading",
    (_n, src, props) => {
      expect(flat(src)).toContain(flat("<ResultCount " + props));
      expect(src).toContain("loading={loading}");
      expect(src).toContain("page={page}");
    },
  );

  it("Lesson Notes counts the filtered notes out of all loaded, and notes the 100 cap", () => {
    const lessons = norm(lessonNotesRaw);
    expect(lessons).toContain("matching={filtered.length}");
    expect(lessons).toContain("total={notes.length}");
    expect(lessons).toContain(
      "capLimit={capped ? LESSON_NOTES_LIMIT : undefined}",
    );
  });

  it("is announced politely and uses the shared page size", () => {
    const count = norm(countRaw);
    expect(count).toContain('role="status" aria-live="polite"');
    expect(count).toContain("pageSize: PAGE_SIZE");
  });
});
