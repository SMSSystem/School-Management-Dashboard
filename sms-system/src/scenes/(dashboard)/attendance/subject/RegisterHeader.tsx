import type { SubjectDocument } from '@/lib/firebase';
import type { ActiveTimeBlock } from '@/hooks/useInstitutionAcademicCalendar';

type Option = { id: string; name: string };

// The register's title and its selectors: the time block (custom calendar mode), the subject and the class.
export function RegisterHeader({
  isCustomMode,
  selectedBlock,
  setSelectedBlockTermId,
  activeTimeBlocks,
  selectedSubjectId,
  setSelectedSubjectId,
  subjects,
  selectedSubject,
  selectedClassName,
  showClassSelector,
  selectedClassId,
  setSelectedClassId,
  classesForDropdown,
  setSaveAttempted,
  setSaveError,
}: {
  isCustomMode: boolean;
  selectedBlock: ActiveTimeBlock | null;
  setSelectedBlockTermId: (termId: string) => void;
  activeTimeBlocks: ActiveTimeBlock[];
  selectedSubjectId: string;
  setSelectedSubjectId: (id: string) => void;
  subjects: (SubjectDocument & { id: string })[];
  selectedSubject: (SubjectDocument & { id: string }) | null;
  selectedClassName: string;
  showClassSelector: boolean;
  selectedClassId: string;
  setSelectedClassId: (id: string) => void;
  classesForDropdown: Option[];
  setSaveAttempted: (attempted: boolean) => void;
  setSaveError: (error: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Subject Attendance Register</h1>
        {selectedSubject && selectedClassName && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {selectedSubject.name} · {selectedClassName}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Time Block selector (§3.2, custom-mode only) — scopes classesForDropdown */}
        {isCustomMode && (
          <select
            value={selectedBlock?.term.id ?? ''}
            onChange={(e) => setSelectedBlockTermId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {activeTimeBlocks.map((b) => (
              <option key={b.term.id} value={b.term.id}>{b.year.name}</option>
            ))}
          </select>
        )}

        <select
          value={selectedSubjectId}
          onChange={(e) => {
            setSelectedSubjectId(e.target.value);
            setSaveAttempted(false);
            setSaveError(null);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">Select a subject…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {showClassSelector && (
          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setSaveAttempted(false);
              setSaveError(null);
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Select a class…</option>
            {classesForDropdown.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
