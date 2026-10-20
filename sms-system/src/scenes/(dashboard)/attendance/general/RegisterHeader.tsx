import type { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import type { Role } from '@/types/people';
import type { StudentRow } from '@/lib/generalAttendanceLogic';

type TimeBlock = ReturnType<typeof useInstitutionAcademicCalendar>['activeTimeBlocks'][number];

// The title with the class and its head-count, the PDF export link, and the time block and class selectors.
export function RegisterHeader({
  effectiveClassName,
  students,
  isCustomMode,
  role,
  resolvedBlock,
  setExportModalOpen,
  selectedBlock,
  setSelectedBlockTermId,
  activeTimeBlocks,
  selectedClassId,
  setSelectedClassId,
  scopedClasses,
}: {
  effectiveClassName: string;
  students: StudentRow[];
  isCustomMode: boolean;
  role: Role | null;
  resolvedBlock: TimeBlock | null;
  setExportModalOpen: (open: boolean) => void;
  selectedBlock: TimeBlock | null;
  setSelectedBlockTermId: (termId: string) => void;
  activeTimeBlocks: TimeBlock[];
  selectedClassId: string;
  setSelectedClassId: (classId: string) => void;
  scopedClasses: { id: string; name: string }[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">General Attendance Register</h1>
          {effectiveClassName && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {effectiveClassName} ({students.length})
            </p>
          )}
          {isCustomMode && role === 'senior_teacher' && resolvedBlock && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{resolvedBlock.year.name}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline"
        >
          Export PDF
        </button>

        {/* Time Block selector (§3.2, custom-mode admin/super_admin path only) — scopes the class selector below */}
        {isCustomMode && role !== 'senior_teacher' && (
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

        {/* Class selector for admin/super_admin */}
        {role !== 'senior_teacher' && (
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Select a class…</option>
            {scopedClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>
    </>
  );
}
