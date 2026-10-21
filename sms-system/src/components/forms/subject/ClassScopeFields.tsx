import type { FieldErrors } from "react-hook-form";
import type { SubjectFormValues } from "@/lib/subjectFormLogic";
import NameCheckList from "../NameCheckList";

// Whether the subject is for the whole institution or for specific classes, and the class checklist.
export default function ClassScopeFields({
  classScope,
  liveClasses,
  selectedClassIds,
  errors,
  handleScopeChange,
  toggleClass,
}: {
  classScope: 'institution' | 'class';
  liveClasses: { id: string; name: string }[];
  selectedClassIds: string[];
  errors: FieldErrors<SubjectFormValues>;
  handleScopeChange: (scope: 'institution' | 'class') => void;
  toggleClass: (id: string, name: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2 w-full">
        <label className="text-xs text-gray-500 dark:text-gray-300">Class Scope</label>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              value="institution"
              checked={classScope === 'institution'}
              onChange={() => handleScopeChange('institution')}
            />
            Entire Institution
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              value="class"
              checked={classScope === 'class'}
              onChange={() => handleScopeChange('class')}
            />
            Specific Class(es)
          </label>
        </div>
        {errors.classScope?.message && (
          <p className="text-xs text-red-400">{errors.classScope.message.toString()}</p>
        )}
      </div>

      {classScope === 'class' && (
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Classes</label>
          <NameCheckList classes={liveClasses} selectedIds={selectedClassIds} onToggle={toggleClass} />
          {errors.classIds?.message && (
            <p className="text-xs text-red-400">{errors.classIds.message.toString()}</p>
          )}
        </div>
      )}
    </>
  );
}
