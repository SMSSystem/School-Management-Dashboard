import { Flag } from "lucide-react";
import type { ExamQuestion } from "@/types/exams";

// One question as a student sees it (EXAMS_FEATURE_SPEC.md §4.5): the text, the options as radio buttons (one correct
// answer) or checkboxes ("Select all that apply"), and a flag-for-review button. Presentational: the staff preview
// and the student's attempt screen both use it and keep the answers themselves. Question and option text is shown as
// plain text, never as HTML.
export default function StudentQuestionView({
  question,
  number,
  total,
  chosen,
  flagged,
  onToggleOption,
  onToggleFlag,
  disabled = false,
}: {
  question: ExamQuestion;
  number: number;
  total: number;
  chosen: readonly string[];
  flagged: boolean;
  onToggleOption: (optionId: string) => void;
  onToggleFlag: () => void;
  disabled?: boolean;
}) {
  const multiple = question.kind === "multiple";
  const inputType = multiple ? "checkbox" : "radio";
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`question-${question.id}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={`question-${question.id}`} className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          Question {number} of {total}
          <span className="ml-2 font-normal">
            ({question.points} {question.points === 1 ? "point" : "points"})
          </span>
        </h2>
        <button
          type="button"
          onClick={onToggleFlag}
          disabled={disabled}
          aria-pressed={flagged}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ${
            flagged
              ? "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700"
              : "text-gray-600 ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700"
          }`}
        >
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
          {flagged ? "Flagged for review" : "Flag for review"}
        </button>
      </div>

      <p className="whitespace-pre-wrap break-words text-base text-gray-900 dark:text-gray-100">{question.text}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{multiple ? "Select all that apply." : "Choose one answer."}</p>

      <ul className="flex flex-col gap-2">
        {question.options.map((option) => {
          const checked = chosen.includes(option.id);
          return (
            <li key={option.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-md p-3 text-sm ring-1 ${
                  checked
                    ? "bg-sky-50 ring-sky-400 dark:bg-sky-900/20 dark:ring-sky-600"
                    : "ring-gray-200 hover:bg-gray-50 dark:ring-gray-700 dark:hover:bg-gray-700/40"
                }`}
              >
                <input
                  type={inputType}
                  name={`answer-${question.id}`}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggleOption(option.id)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">{option.text}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
