import { unanswered, type KeyChoices } from "@/lib/examImportKey";
import type { ImportResult } from "@/lib/examImport";
import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "./builderStyles";

// The answer key step of a Google Forms import (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.5): the printout has no answers, so the
// teacher ticks the right option or options for each question before the questions open in the builder. A question left
// without an answer keeps its warning and must be given one in the builder before the exam can be published. Presentational:
// the import dialog keeps the choices.
export default function ImportKeyEntry({
  result,
  choices,
  onToggle,
  onBack,
  onContinue,
}: {
  result: ImportResult;
  choices: KeyChoices;
  onToggle: (questionId: string, optionId: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const total = result.questions.length;
  const answered = total - unanswered(result, choices);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        A printout of a form has no answers in it. Tick the right answer of each question (all the right ones where it says several). You can leave some for the builder, but an exam
        cannot be published while a question has no answer.
      </p>
      <p role="status" className="text-xs text-gray-600 dark:text-gray-300">
        {answered} of {total} question{total === 1 ? "" : "s"} answered.
      </p>

      <ol className="flex max-h-[55dvh] flex-col gap-3 overflow-y-auto" aria-label="Questions to answer">
        {result.questions.map((q, i) => (
          <li key={q.id} className="rounded-md p-3 ring-1 ring-gray-200 dark:ring-gray-700">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 break-words text-sm font-medium text-gray-900 dark:text-gray-100">
                {i + 1}. {q.text}
                <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">{q.kind === "multiple" ? "Several correct answers" : "One correct answer"}</span>
              </legend>
              {q.options.map((o, k) => (
                <label key={o.id} className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type={q.kind === "multiple" ? "checkbox" : "radio"}
                    name={`key-${q.id}`}
                    checked={(choices[q.id] ?? []).includes(o.id)}
                    onChange={() => onToggle(q.id, o.id)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-label={`Question ${i + 1}, option ${String.fromCharCode(65 + k)} is correct`}
                  />
                  <span className="break-words">
                    <span className="mr-1 font-medium text-gray-500 dark:text-gray-400">{String.fromCharCode(65 + k)}.</span>
                    {o.text}
                  </span>
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onBack} className={SECONDARY_BUTTON_CLS}>
          Back
        </button>
        <button type="button" onClick={onContinue} className={PRIMARY_BUTTON_CLS} style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}>
          Review in the builder
        </button>
      </div>
    </div>
  );
}
