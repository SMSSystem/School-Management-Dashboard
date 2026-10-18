import { IMPORT_WRITE_CAP, STUDENTS_IMPORT_CAP, type Row, type TargetKey } from "@/lib/importConfig";
import { BTN_CLS, CANCEL_BTN_CLS } from "./importStyles";

// The summary step: what the import will create or update, the cap warnings, and the Commit button.
export function SummaryStep({
  resetAll,
  target,
  createCount,
  updateCount,
  resolvedRows,
  gaGroups,
  saGroups,
  duplicateCount,
  writeCount,
  importCap,
  handleCommit,
}: {
  resetAll: () => void;
  target: TargetKey | null;
  createCount: number;
  updateCount: number;
  resolvedRows: Row[];
  gaGroups: unknown[];
  saGroups: unknown[];
  duplicateCount: number;
  writeCount: number;
  importCap: number;
  handleCommit: () => Promise<void>;
}) {
  return (
    <div>
      <button type="button" className="text-sm text-sky-600 dark:text-sky-400 underline mb-3" onClick={resetAll}>
        &larr; Change target
      </button>
      {target === "gradebook" ? (
        <p className="text-base">
          {createCount} result(s) will be created, {updateCount} will be updated.
        </p>
      ) : target === "general_attendance" ? (
        <p className="text-base">
          {createCount} attendance document(s) will be created, {updateCount} will be updated — covering{" "}
          {resolvedRows.length} student-session entries across {gaGroups.length} class/date/session group(s).
        </p>
      ) : target === "subject_attendance" ? (
        <p className="text-base">
          {createCount} attendance document(s) will be created, {updateCount} will be updated — covering{" "}
          {resolvedRows.length} student-session entries across {saGroups.length} subject/class/date group(s).
        </p>
      ) : target === "students" ? (
        <p className="text-base">{resolvedRows.length} student account(s) will be created.</p>
      ) : (
        <>
          <p className="text-base">{resolvedRows.length} document(s) will be created.</p>
          {duplicateCount > 0 && (
            <p className="text-base text-amber-600 dark:text-amber-400 mt-1">
              {duplicateCount} of these rows match an already-existing record — this is informational only and
              won&apos;t block the import (§19.3).
            </p>
          )}
        </>
      )}
      {writeCount > importCap && target === "students" && (
        <p className="text-base text-red-500 mt-2">
          This file would create {writeCount} accounts, over the {STUDENTS_IMPORT_CAP}-account limit per import
          (Firebase allows at most 100 new accounts per hour from this network). Split the file and import again
          in a later session.
        </p>
      )}
      {writeCount > importCap && target !== "students" && (
        <p className="text-base text-red-500 mt-2">
          This file would write {writeCount} documents, over the {IMPORT_WRITE_CAP}-write limit per import. Split
          the file and import in smaller batches.
        </p>
      )}
      <div className="flex items-center gap-3 mt-3">
        <button type="button" className={CANCEL_BTN_CLS} onClick={resetAll}>
          Cancel Import
        </button>
        {writeCount <= importCap && (
          <button type="button" className={BTN_CLS} disabled={writeCount === 0} onClick={() => void handleCommit()}>
            Commit import
          </button>
        )}
      </div>
    </div>
  );
}
