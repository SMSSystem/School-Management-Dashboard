import type { TeachingStaffMember } from "@/lib/teachingStaff";

// The subject's teachers (a checklist) and its optional assistant teacher (one of the ticked ones).
export default function TeacherFields({
  teachingStaff,
  selectedTeacherIds,
  selectedTeacherNames,
  assistantId,
  setAssistantId,
  toggleTeacher,
}: {
  teachingStaff: TeachingStaffMember[];
  selectedTeacherIds: string[];
  selectedTeacherNames: string[];
  assistantId: string;
  setAssistantId: (id: string) => void;
  toggleTeacher: (id: string, name: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2 w-full">
        <label className="text-xs text-gray-500 dark:text-gray-300">Teachers</label>
        <div className="ring-[1.5px] ring-gray-300 rounded-md p-2 max-h-40 overflow-y-auto dark:ring-gray-600 dark:bg-gray-900">
          {teachingStaff.length === 0 ? (
            <p className="text-xs text-gray-400">No teachers found.</p>
          ) : (
            teachingStaff.map((teacher) => (
              <label key={teacher.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTeacherIds.includes(teacher.id)}
                  onChange={() => toggleTeacher(teacher.id, teacher.name)}
                />
                {teacher.label}
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full">
        <label className="text-xs text-gray-500 dark:text-gray-300">Assistant teacher (optional)</label>
        <select
          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:bg-gray-900 dark:ring-gray-600 dark:text-gray-100"
          value={assistantId}
          onChange={(e) => setAssistantId(e.target.value)}
          disabled={selectedTeacherIds.length === 0}
        >
          <option value="">None</option>
          {selectedTeacherIds.map((id, i) => (
            <option key={id} value={id}>
              {selectedTeacherNames[i] ?? id}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400">
          Choose from the ticked teachers. An assistant has the same access as the other teachers; the lead teacher is
          the one named on reports.
        </p>
      </div>
    </>
  );
}
