import type { Role } from "@/types/people";
import type { SubjectDoc } from "@/lib/gradebookLogic";

// The heading with its tour button, the "subject - class - term" line, and the term, class and subject pickers.
export function GradebookFilters({
  collapseForTour,
  startNextStep,
  allSelected,
  selectedSubjectDoc,
  selectedClassName,
  selectedTerm,
  terms,
  selectedTermId,
  setSelectedTermId,
  setSelectedSubjectId,
  selectedClassId,
  setSelectedClassId,
  role,
  visibleClasses,
  selectedSubjectId,
  visibleSubjects,
}: {
  collapseForTour: () => void;
  startNextStep: (tourName: string) => void;
  allSelected: boolean;
  selectedSubjectDoc: SubjectDoc | undefined;
  selectedClassName: string;
  selectedTerm: { name?: string } | undefined;
  terms: { id: string; name: string }[];
  selectedTermId: string;
  setSelectedTermId: (termId: string) => void;
  setSelectedSubjectId: (subjectId: string) => void;
  selectedClassId: string;
  setSelectedClassId: (classId: string) => void;
  role: Role | null;
  visibleClasses: { id: string; name: string }[];
  selectedSubjectId: string;
  visibleSubjects: SubjectDoc[];
}) {
  return (
    <>
      {/* Heading */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold dark:text-white">Gradebook</h1>
        <button
          onClick={() => {
            collapseForTour();
            startNextStep("gradebook");
          }}
          className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Take a tour
        </button>
      </div>
      {allSelected && selectedSubjectDoc && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {selectedSubjectDoc.name} — {selectedClassName} —{" "}
          {selectedTerm?.name ?? ""}
        </p>
      )}

      {/* Dropdowns */}
      <div className="flex flex-wrap gap-3 mb-4">
        {/* Term */}
        <div id="tour-gradebook-term" className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Term
          </label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer"
            value={selectedTermId}
            onChange={(e) => {
              setSelectedTermId(e.target.value);
              setSelectedSubjectId("");
            }}
          >
            <option value="">Select term</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Class */}
        <div id="tour-gradebook-class" className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Class
          </label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
            value={selectedClassId}
            disabled={role === "senior_teacher"}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setSelectedSubjectId("");
            }}
          >
            <option value="">Select class</option>
            {visibleClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Subject */}
        <div id="tour-gradebook-subject" className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Subject
          </label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
            value={selectedSubjectId}
            disabled={!selectedClassId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
          >
            <option value="">Select subject</option>
            {visibleSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
