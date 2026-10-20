import type { Role } from "@/types/people";
import type { SubjectDoc } from "@/lib/gradebookLogic";
import NamedSelect from "@/components/NamedSelect";

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
          <NamedSelect
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer"
            value={selectedTermId}
            onChange={(termId) => {
              setSelectedTermId(termId);
              setSelectedSubjectId("");
            }}
            placeholder="Select term"
            options={terms}
          />
        </div>

        {/* Class */}
        <div id="tour-gradebook-class" className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Class
          </label>
          <NamedSelect
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
            value={selectedClassId}
            disabled={role === "senior_teacher"}
            onChange={(classId) => {
              setSelectedClassId(classId);
              setSelectedSubjectId("");
            }}
            placeholder="Select class"
            options={visibleClasses}
          />
        </div>

        {/* Subject */}
        <div id="tour-gradebook-subject" className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Subject
          </label>
          <NamedSelect
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
            value={selectedSubjectId}
            disabled={!selectedClassId}
            onChange={setSelectedSubjectId}
            placeholder="Select subject"
            options={visibleSubjects}
          />
        </div>
      </div>
    </>
  );
}
