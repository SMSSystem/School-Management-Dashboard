import { COMMENT_KEY, firstNameOf, renderComment } from "@/lib/commentKey";
import type { StudentDoc } from "@/lib/gradebookLogic";

// The row that opens under a student to choose up to five report-card comments.
export function CommentPickerRow({
  student,
  colSpan,
  tempCommentSelection,
  toggleTempComment,
  confirmCommentPicker,
  setOpenCommentPickerId,
  subjectName,
}: {
  student: StudentDoc;
  colSpan: number;
  tempCommentSelection: number[];
  toggleTempComment: (num: number) => void;
  confirmCommentPicker: (studentId: string) => void;
  setOpenCommentPickerId: (studentId: string | null) => void;
  subjectName: string | undefined;
}) {
  return (
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="px-4 py-3 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-700"
                    >
                      <div className="max-w-xl">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                          {tempCommentSelection.length > 0
                            ? `Selected: ${tempCommentSelection.join(", ")}`
                            : "Select up to 5 comments"}
                        </p>
                        <div className="grid grid-cols-1 gap-0.5 max-h-48 overflow-y-auto pr-1">
                          {COMMENT_KEY.map((text, i) => {
                            const num = i + 1;
                            const isChecked =
                              tempCommentSelection.includes(num);
                            const isDisabled =
                              !isChecked && tempCommentSelection.length >= 5;
                            return (
                              <label
                                key={num}
                                className={`flex items-start gap-2 text-xs py-1 px-1 rounded select-none ${
                                  isDisabled
                                    ? "opacity-40 cursor-not-allowed"
                                    : "hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isDisabled}
                                  onChange={() =>
                                    !isDisabled && toggleTempComment(num)
                                  }
                                  className="mt-0.5 shrink-0"
                                />
                                <span className="dark:text-gray-200">
                                  <span className="font-medium">{num}.</span>{" "}
                                  {renderComment(text, {
                                    studentName: firstNameOf(student.name),
                                    gender: student.gender as
                                      | "Male"
                                      | "Female"
                                      | undefined,
                                    subjectName,
                                  })}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => confirmCommentPicker(student.id)}
                            className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer"
                          >
                            Done
                          </button>
                          <button
                            onClick={() => setOpenCommentPickerId(null)}
                            className="px-3 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-200 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
  );
}
