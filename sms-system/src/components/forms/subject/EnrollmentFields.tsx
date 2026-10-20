import type { Dispatch, SetStateAction } from "react";
import { onLoadError } from "@/lib/reportError";
import {
  ALL_STUDENTS,
  setEnrollmentType,
  toggleExcludedStudent,
  type EnrollmentsByClass,
  type Frequency,
} from "@/lib/subjectFormLogic";

// Which students of each class take the subject: everyone, or everyone except the ones unticked.
export default function EnrollmentFields({
  frequency,
  classScope,
  selectedClassIds,
  liveClasses,
  enrollmentByClass,
  setEnrollmentByClass,
  classStudents,
  loadStudentsForClass,
}: {
  frequency: Frequency;
  classScope: 'institution' | 'class';
  selectedClassIds: string[];
  liveClasses: { id: string; name: string }[];
  enrollmentByClass: EnrollmentsByClass;
  setEnrollmentByClass: Dispatch<SetStateAction<EnrollmentsByClass>>;
  classStudents: Record<string, { uid: string; name: string }[]>;
  loadStudentsForClass: (classId: string) => Promise<void>;
}) {
  if (!frequency) return null;
  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-xs text-gray-500 dark:text-gray-300">Student Enrollment</label>
      {(classScope === 'class' ? selectedClassIds : liveClasses.map((c) => c.id)).length === 0 ? (
        <p className="text-xs text-gray-400">
          {classScope === 'class' ? 'Select at least one class above.' : 'No classes found.'}
        </p>
      ) : (
        (classScope === 'class' ? selectedClassIds : liveClasses.map((c) => c.id)).map((classId) => {
          const cls = liveClasses.find((c) => c.id === classId);
          const enrollment = enrollmentByClass[classId] ?? ALL_STUDENTS;
          return (
            <div key={classId} className="ring-[1.5px] ring-gray-300 dark:ring-gray-600 rounded-md p-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{cls?.name ?? classId}</p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={enrollment.type === 'all'}
                  onChange={(e) => {
                    const nextType = e.target.checked ? 'all' : 'selective';
                    setEnrollmentByClass((prev) => setEnrollmentType(prev, classId, nextType));
                    if (nextType === 'selective') {
                      loadStudentsForClass(classId).catch(onLoadError("the class's students"));
                    }
                  }}
                />
                All students enrolled
              </label>
              {enrollment.type === 'selective' && (
                <div className="ml-4 max-h-32 overflow-y-auto flex flex-col gap-1">
                  {(classStudents[classId] ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400">Loading students…</p>
                  ) : (
                    (classStudents[classId] ?? []).map((student) => {
                      const excluded = enrollment.excludedIds.includes(student.uid);
                      return (
                        <label key={student.uid} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!excluded}
                            onChange={() => {
                              setEnrollmentByClass((prev) => toggleExcludedStudent(prev, classId, student, excluded));
                            }}
                          />
                          {student.name}
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
