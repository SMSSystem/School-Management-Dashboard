import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { questionLabel } from "@/lib/examBuilderNav";
import { EXAM_LIMITS } from "@/types/exams";
import type { BuilderQuestion } from "@/lib/examBuilderLogic";
import type { ExamIssue } from "@/lib/examKeyValidation";

const MOVE_BTN =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700";

// The list of the exam's questions, for the rail beside the editor and for the sheet on a phone: each one's number, its
// first words, its points and an amber mark when it has something to fix (said in words, not only in colour), the chosen one
// marked, a switch that shows only the questions that need attention, and, while the exam can be edited, Add question. The
// rail also moves a question up or down (`onMove`); the sheet does not, since the editor's own buttons do. Choosing a
// question is `onSelect`.
export default function BuilderListPanel({
  questions,
  activeId,
  issuesByQuestion,
  onlyIssues,
  onToggleIssues,
  onSelect,
  onMove,
  onAdd,
  large = false,
}: {
  questions: readonly BuilderQuestion[];
  activeId: string | undefined;
  issuesByQuestion: Readonly<Record<string, readonly ExamIssue[]>>;
  onlyIssues: boolean;
  onToggleIssues: () => void;
  onSelect: (id: string) => void;
  /** Moves the question at an index (rail only, and only while the exam can be edited). */
  onMove?: (index: number, delta: -1 | 1) => void;
  /** Adds a question (only while the exam can be edited). */
  onAdd?: () => void;
  /** 44 px rows, for a finger. */
  large?: boolean;
}) {
  const hasIssues = (q: BuilderQuestion) => (issuesByQuestion[q.id]?.length ?? 0) > 0;
  const attention = questions.filter(hasIssues).length;
  const shown = questions.map((q, index) => ({ q, index })).filter(({ q }) => !onlyIssues || hasIssues(q));

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-pressed={onlyIssues}
        onClick={onToggleIssues}
        disabled={attention === 0 && !onlyIssues}
        className={`w-fit rounded-md px-2 py-1 text-xs font-medium ring-1 disabled:opacity-50 ${
          onlyIssues
            ? "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-100 dark:ring-amber-700"
            : "text-gray-700 ring-gray-300 hover:bg-gray-50 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
        }`}
      >
        Needs attention ({attention})
      </button>

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{questions.length === 0 ? "There are no questions yet." : "No question needs attention."}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {shown.map(({ q, index }) => {
            const active = q.id === activeId;
            const problem = hasIssues(q);
            return (
              <li key={q.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(q.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm ${large ? "min-h-11" : "py-1.5"} ${
                    active
                      ? "bg-sky-50 ring-1 ring-sky-400 dark:bg-sky-900/20 dark:ring-sky-600"
                      : "ring-1 ring-gray-200 hover:bg-gray-50 dark:ring-gray-700 dark:hover:bg-gray-700/40"
                  }`}
                >
                  <span className="w-6 shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{questionLabel(q)}</span>
                  {problem && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
                      <span className="sr-only">has problems</span>
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{Number.isFinite(q.points) ? q.points : "?"}</span>
                </button>
                {onMove && (
                  <>
                    <button type="button" className={MOVE_BTN} onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move question ${index + 1} up`} title="Move up">
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={MOVE_BTN}
                      onClick={() => onMove(index, 1)}
                      disabled={index === questions.length - 1}
                      aria-label={`Move question ${index + 1} down`}
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {onAdd && (
        <button
          type="button"
          disabled={questions.length >= EXAM_LIMITS.maxQuestions}
          onClick={onAdd}
          className={`flex w-fit items-center gap-1.5 rounded-md px-2 text-sm font-medium text-sky-700 ring-1 ring-sky-300 hover:bg-sky-50 disabled:opacity-50 dark:text-sky-300 dark:ring-sky-700 dark:hover:bg-sky-900/20 ${large ? "min-h-11" : "py-1.5"}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add question
        </button>
      )}
    </div>
  );
}
