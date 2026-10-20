import ExportMenu from "@/components/ExportMenu";
import { downloadImportTemplate, type RowError } from "@/lib/spreadsheetImport";
import type { GradebookTargetContext } from "@/lib/importGradebook";
import {
  ATTENDANCE_MERGE_NOTE,
  IMPLEMENTED_TARGETS,
  SHARED_STUDENT_IMPORT_PASSWORD,
  STUDENTS_IDENTITY_OPTIONAL_NOTE,
  STUDENTS_IMPORT_CAP,
  TARGET_ENUM_HELP,
  TARGET_IDENTITY_COLUMNS,
  columnsFor,
  exampleRowFor,
  type TargetKey,
} from "@/lib/importConfig";

// The upload step: what the file should contain, the template download, the drop zone and the file errors.
export function UploadStep({
  target,
  resetAll,
  gradebookContext,
  busy,
  fileError,
  structuralMissing,
  rowErrors,
  handleFile,
}: {
  target: TargetKey;
  resetAll: () => void;
  gradebookContext: GradebookTargetContext | null;
  busy: boolean;
  fileError: string | null;
  structuralMissing: string[];
  rowErrors: RowError[];
  handleFile: (file: File) => Promise<void>;
}) {
  return (
    <div>
      <button type="button" className="text-sm text-sky-600 dark:text-sky-400 underline mb-3" onClick={resetAll}>
        &larr; Change target
      </button>
      <p className="text-base mb-2">
        Importing: <span className="font-medium">{IMPLEMENTED_TARGETS.find((t) => t.key === target)?.label}</span>
        {target === "gradebook" && gradebookContext && (
          <>
            {" "}
            — {gradebookContext.className} / {gradebookContext.subjectName} / {gradebookContext.termName}
          </>
        )}
      </p>

      <div className="ring-[1.5px] ring-gray-200 dark:ring-gray-700 rounded-md p-3 mb-3 text-sm text-gray-600 dark:text-gray-300 flex flex-col gap-1.5">
        <p>
          Identity columns ({TARGET_IDENTITY_COLUMNS[target].join(", ")}) are matched by name against your
          institution's existing records. A value that matches more than one record, or none, will need to be
          resolved by hand before anything is written.
        </p>
        {target === "students" && <p>{STUDENTS_IDENTITY_OPTIONAL_NOTE}</p>}
        {TARGET_ENUM_HELP[target] && <p>{TARGET_ENUM_HELP[target]}</p>}
        {(target === "general_attendance" || target === "subject_attendance") && <p>{ATTENDANCE_MERGE_NOTE}</p>}
        {target === "students" && (
          <>
            <p>
              Every account created here gets the same temporary password:{" "}
              <span className="font-mono font-medium">{SHARED_STUDENT_IMPORT_PASSWORD}</span>. Share it with each
              student — they&apos;ll be required to set their own password the first time they sign in.
            </p>
            <p>
              Limited to {STUDENTS_IMPORT_CAP} accounts per import (Firebase allows at most 100 new accounts per
              hour from this network). Larger cohorts need a second import after an hour.
            </p>
          </>
        )}
      </div>

      <div className="mb-3">
        <ExportMenu
          formats={["csv", "xlsx"]}
          label="Download Template"
          onExport={(format) =>
            downloadImportTemplate(`import-template-${target}`, columnsFor(target), exampleRowFor(target), format)
          }
        />
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        className="ring-[1.5px] ring-dashed ring-gray-300 dark:ring-gray-600 rounded-md p-8 text-center text-base text-gray-500 dark:text-gray-400"
      >
        <p>Drag and drop a CSV, XLSX, or JSON file here, or</p>
        <label className="inline-block mt-2 cursor-pointer text-sky-600 dark:text-sky-400 underline">
          browse files
          <input
            type="file"
            accept=".csv,.xlsx,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>
      </div>
      {busy && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Reading file…</p>}
      {fileError && <p className="text-sm text-red-500 mt-2">{fileError}</p>}
      {structuralMissing.length > 0 && (
        <p className="text-sm text-red-500 mt-2">
          Missing required column(s): {structuralMissing.join(", ")}
        </p>
      )}
      {rowErrors.length > 0 && (
        <div className="mt-2 text-sm text-red-500">
          <p>{rowErrors.length} row(s) have errors — fix the file and re-upload:</p>
          <ul className="list-disc list-inside max-h-40 overflow-y-auto">
            {rowErrors.slice(0, 50).map((e, i) => (
              <li key={i}>
                Row {e.row}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
