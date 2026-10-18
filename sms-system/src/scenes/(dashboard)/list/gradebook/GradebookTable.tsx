import { Fragment } from "react";
import type { MutableRefObject } from "react";
import { Pencil } from "lucide-react";
import type { ColumnDoc, DirtyScores, StudentDoc, SubjectDoc } from "@/lib/gradebookLogic";
import { CommentPickerRow } from "./CommentPickerRow";

// The grid: a row per student with a score cell per column, the average, the conduct grade and the comments.
export function GradebookTable({
  allSelected,
  loading,
  loadError,
  effectiveColumns,
  showEditControls,
  isCompletedTerm,
  setEditingColumn,
  showAverage,
  students,
  canEdit,
  getScore,
  hasScoreErrorFor,
  inputRefs,
  setDirtyScores,
  handleScoreKeyDown,
  computeAverage,
  getConductGrade,
  setDirtyConduct,
  getCommentNumbers,
  openCommentPicker,
  openCommentPickerId,
  tempCommentSelection,
  toggleTempComment,
  confirmCommentPicker,
  setOpenCommentPickerId,
  selectedSubjectDoc,
}: {
  allSelected: boolean;
  loading: boolean;
  loadError: string | null;
  effectiveColumns: ColumnDoc[];
  showEditControls: boolean;
  isCompletedTerm: boolean;
  setEditingColumn: (column: ColumnDoc) => void;
  showAverage: boolean;
  students: StudentDoc[];
  canEdit: boolean;
  getScore: (studentId: string, colId: string) => number | "";
  hasScoreErrorFor: (studentId: string, colId: string, maxScore: number) => boolean;
  inputRefs: MutableRefObject<(HTMLInputElement | null)[][]>;
  setDirtyScores: (update: (prev: DirtyScores) => DirtyScores) => void;
  handleScoreKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, studentIdx: number, colIdx: number) => void;
  computeAverage: (studentId: string) => number;
  getConductGrade: (studentId: string) => string;
  setDirtyConduct: (update: (prev: Record<string, string>) => Record<string, string>) => void;
  getCommentNumbers: (studentId: string) => number[];
  openCommentPicker: (studentId: string) => void;
  openCommentPickerId: string | null;
  tempCommentSelection: number[];
  toggleTempComment: (num: number) => void;
  confirmCommentPicker: (studentId: string) => void;
  setOpenCommentPickerId: (studentId: string | null) => void;
  selectedSubjectDoc: SubjectDoc | undefined;
}) {
  return (
    <>
      {/* Table */}
      {allSelected && !loading && !loadError && (
        <div className="overflow-x-auto">
          <table className="min-w-max w-full text-sm border-collapse">
            <thead>
              <tr
                id="tour-gradebook-grid-header"
                className="bg-gray-50 dark:bg-gray-700/50"
              >
                {/* Fixed headers */}
                <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                  Name
                </th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                  Gender
                </th>

                {/* User-defined column headers */}
                {effectiveColumns.map((col) => (
                  <th
                    key={col.id}
                    className="text-center px-2 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap group relative"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="flex items-center gap-1">
                        {col.label} / {col.maxScore}
                        {showEditControls && !isCompletedTerm && (
                          <button
                            onClick={() => setEditingColumn(col)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer"
                            title={`Edit column: ${col.label}`}
                            aria-label={`Edit column: ${col.label}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                      <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
                        {col.assessmentType === "coursework" ? "CW" : "Exam"} ·{" "}
                        {col.columnWeight}%
                      </span>
                    </div>
                  </th>
                ))}

                {/* Average header */}
                {showAverage && (
                  <th className="text-center px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    Average
                  </th>
                )}

                {/* Conduct header */}
                <th className="text-center px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                  Conduct
                </th>

                {/* Comments header */}
                <th className="text-center px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                  Comments
                </th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr>
                  <td
                    colSpan={
                      2 + effectiveColumns.length + (showAverage ? 1 : 0) + 2
                    }
                    className="px-3 py-6 text-center text-gray-400 dark:text-gray-500"
                  >
                    No students found in this class.
                  </td>
                </tr>
              )}
              {students.map((student, studentIdx) => (
                <Fragment key={student.id}>
                  <tr className="border-b border-gray-100 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/40 hover:bg-lamaPurpleLight dark:hover:bg-gray-700/40">
                    {/* Name */}
                    <td className="px-3 py-2 whitespace-nowrap dark:text-gray-200">
                      {student.name}
                    </td>
                    {/* Gender */}
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {student.gender ?? "—"}
                    </td>

                    {/* Score cells */}
                    {effectiveColumns.map((col, colIdx) => {
                      const scoreVal = getScore(student.id, col.id);
                      const hasError = hasScoreErrorFor(
                        student.id,
                        col.id,
                        col.maxScore,
                      );
                      return (
                        <td key={col.id} className="px-2 py-1 text-center">
                          {canEdit ? (
                            <div className="flex flex-col items-center">
                              <input
                                ref={(el) => {
                                  if (!inputRefs.current[studentIdx]) {
                                    inputRefs.current[studentIdx] = [];
                                  }
                                  inputRefs.current[studentIdx][colIdx] = el;
                                }}
                                type="number"
                                min={0}
                                max={col.maxScore}
                                value={scoreVal}
                                onChange={(e) => {
                                  const val =
                                    e.target.value === ""
                                      ? ""
                                      : Number(e.target.value);
                                  setDirtyScores((prev) => ({
                                    ...prev,
                                    [student.id]: {
                                      ...(prev[student.id] ?? {}),
                                      [col.id]: val as number | "",
                                    },
                                  }));
                                }}
                                onKeyDown={(e) =>
                                  handleScoreKeyDown(e, studentIdx, colIdx)
                                }
                                className={`w-16 text-right p-1 rounded border text-sm dark:bg-gray-900 dark:text-gray-100 ${
                                  hasError
                                    ? "border-red-400 ring-1 ring-red-400"
                                    : "border-gray-300 dark:border-gray-600"
                                }`}
                              />
                              {hasError && (
                                <span className="text-[10px] text-red-500">
                                  Max {col.maxScore}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">
                              {scoreVal === "" ? "—" : scoreVal}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* Average */}
                    {showAverage && (
                      <td className="px-3 py-2 text-center text-gray-700 dark:text-gray-300 font-medium">
                        {computeAverage(student.id)}%
                      </td>
                    )}

                    {/* Conduct */}
                    <td className="px-2 py-1 text-center">
                      {canEdit ? (
                        <select
                          value={getConductGrade(student.id)}
                          onChange={(e) =>
                            setDirtyConduct((prev) => ({
                              ...prev,
                              [student.id]: e.target.value,
                            }))
                          }
                          className="p-1 rounded border border-gray-300 dark:border-gray-600 text-sm dark:bg-gray-900 dark:text-gray-100 cursor-pointer"
                        >
                          <option value="">—</option>
                          <option value="G">G — Good</option>
                          <option value="S">S — Satisfactory</option>
                          <option value="F">F — Fair</option>
                          <option value="U">U — Unsatisfactory</option>
                          <option value="P">P — Poor</option>
                          <option value="D">D — Disruption</option>
                        </select>
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">
                          {getConductGrade(student.id) || "—"}
                        </span>
                      )}
                    </td>

                    {/* Comments */}
                    <td className="px-2 py-1 text-center">
                      {canEdit ? (
                        <button
                          onClick={() => openCommentPicker(student.id)}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          {getCommentNumbers(student.id).length > 0
                            ? getCommentNumbers(student.id).join(", ")
                            : "Set…"}
                        </button>
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">
                          {getCommentNumbers(student.id).length > 0
                            ? getCommentNumbers(student.id).join(", ")
                            : "—"}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Comment picker row */}
                  {openCommentPickerId === student.id && (
                    <CommentPickerRow
                      student={student}
                      colSpan={2 + effectiveColumns.length + (showAverage ? 1 : 0) + 2}
                      tempCommentSelection={tempCommentSelection}
                      toggleTempComment={toggleTempComment}
                      confirmCommentPicker={confirmCommentPicker}
                      setOpenCommentPickerId={setOpenCommentPickerId}
                      subjectName={selectedSubjectDoc?.name}
                    />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
