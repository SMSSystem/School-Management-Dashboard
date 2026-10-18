import type { useAuth } from "@/lib/AuthContext";

// The term's four report card comments: read-only unless the viewer may edit, with Save Comments.
export function ReportCardCommentsSection({
  institution,
  classSupervisorComment,
  setClassSupervisorComment,
  gradeSupervisorComment,
  setGradeSupervisorComment,
  principalComment,
  setPrincipalComment,
  vicePrincipalComment,
  setVicePrincipalComment,
  mayEdit,
  commentError,
  commentSaved,
  handleSaveComments,
  savingComments,
}: {
  institution: ReturnType<typeof useAuth>["institution"];
  classSupervisorComment: string;
  setClassSupervisorComment: (value: string) => void;
  gradeSupervisorComment: string;
  setGradeSupervisorComment: (value: string) => void;
  principalComment: string;
  setPrincipalComment: (value: string) => void;
  vicePrincipalComment: string;
  setVicePrincipalComment: (value: string) => void;
  mayEdit: boolean;
  commentError: string | null;
  commentSaved: boolean;
  handleSaveComments: () => Promise<void>;
  savingComments: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-4">
      <h2 className="text-base font-semibold">Report Card Comments</h2>

      {[
        {
          label: institution?.classSupervisorLabel ?? "Class Supervisor",
          value: classSupervisorComment,
          setter: setClassSupervisorComment,
        },
        {
          label: institution?.gradeSupervisorLabel ?? "Grade Supervisor",
          value: gradeSupervisorComment,
          setter: setGradeSupervisorComment,
        },
        {
          label: institution?.principalLabel ?? "Principal",
          value: principalComment,
          setter: setPrincipalComment,
        },
        {
          label: institution?.vicePrincipalLabel ?? "Vice Principal",
          value: vicePrincipalComment,
          setter: setVicePrincipalComment,
        },
      ].map(({ label, value, setter }) => (
        <label
          key={label}
          className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          {label}
          <textarea
            value={value}
            onChange={(e) => setter(e.target.value)}
            readOnly={!mayEdit}
            rows={3}
            maxLength={500}
            className="mt-0.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400 resize-none"
          />
        </label>
      ))}

      {commentError && (
        <p className="text-xs text-red-500">{commentError}</p>
      )}

      {mayEdit && (
        <div className="flex items-center gap-3 justify-end pt-1 border-t border-gray-100 dark:border-gray-700">
          {commentSaved && (
            <span className="text-xs text-green-600 dark:text-green-400">
              Comments saved.
            </span>
          )}
          <button
            onClick={handleSaveComments}
            disabled={savingComments}
            className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
          >
            {savingComments ? "Saving…" : "Save Comments"}
          </button>
        </div>
      )}
    </div>
  );
}
