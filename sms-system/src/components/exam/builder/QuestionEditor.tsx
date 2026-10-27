import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from "lucide-react";
import { EXAM_LIMITS, type ExamAnswerMode, type ExamQuestionKind } from "@/types/exams";
import {
  addOption,
  removeOption,
  setKind,
  setOptionText,
  toggleCorrect,
  type BuilderQuestion,
  type EditMode,
  type PreparedImage,
} from "@/lib/examBuilderLogic";
import type { ExamIssue } from "@/lib/examKeyValidation";
import QuestionImageControl from "./QuestionImageControl";

const INPUT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 disabled:bg-gray-50 disabled:text-gray-700 dark:disabled:bg-gray-800";
const ICON_BTN =
  "flex h-11 w-11 items-center justify-center md:h-8 md:w-8 rounded-md text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700";

// One question in the builder (EXAMS_FEATURE_SPEC.md §4.3): text, kind (a choice only when the exam allows both),
// two to six options with the correct ones marked, and points. In key-only mode (students have seen the questions)
// only the correct-answer marks can be changed; in read-only mode nothing can.
export default function QuestionEditor({
  question,
  index,
  total,
  answerMode,
  mode,
  issues,
  imageSrc,
  onChange,
  onPicture,
  onRemovePicture,
  onPictureAlt,
  onMove,
  onDuplicate,
  onDelete,
}: {
  question: BuilderQuestion;
  index: number;
  total: number;
  answerMode: ExamAnswerMode | undefined;
  mode: EditMode;
  issues: readonly ExamIssue[];
  /** The data URL of the question's picture, from the exam's packs. */
  imageSrc: string | undefined;
  onChange: (next: BuilderQuestion) => void;
  onPicture: (picture: PreparedImage) => void;
  onRemovePicture: () => void;
  onPictureAlt: (alt: string, decorative: boolean) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const n = index + 1;
  const full = mode === "full";
  const canMark = mode !== "read_only";
  const multiple = question.kind === "multiple";
  const idBase = `q-${question.id}`;

  return (
    <article
      className="flex flex-col gap-3 rounded-md p-4 ring-1 ring-gray-200 dark:ring-gray-700"
      aria-labelledby={`${idBase}-heading`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${idBase}-heading`} className="text-sm font-semibold">
          Question {n}
          <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
            {multiple ? "Several correct answers" : "One correct answer"}
          </span>
        </h2>
        {full && (
          <div className="flex items-center gap-1">
            <button type="button" className={ICON_BTN} onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move question ${n} up`} title="Move up">
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className={ICON_BTN} onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Move question ${n} down`} title="Move down">
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className={ICON_BTN} onClick={onDuplicate} disabled={total >= EXAM_LIMITS.maxQuestions} aria-label={`Duplicate question ${n}`} title="Duplicate">
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className={ICON_BTN} onClick={onDelete} aria-label={`Delete question ${n}`} title="Delete">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idBase}-text`} className="text-xs text-gray-500 dark:text-gray-300">
          Question text
        </label>
        <textarea
          id={`${idBase}-text`}
          rows={3}
          maxLength={EXAM_LIMITS.questionTextMax}
          disabled={!full}
          value={question.text}
          onChange={(e) => onChange({ ...question, text: e.target.value })}
          className={INPUT_CLS}
        />
        {full && (
          <p className="text-right text-xs text-gray-400">
            {question.text.length} / {EXAM_LIMITS.questionTextMax}
          </p>
        )}
      </div>

      <QuestionImageControl
        idBase={idBase}
        image={question.image}
        src={imageSrc}
        editable={full}
        onPicked={onPicture}
        onRemove={onRemovePicture}
        onAlt={onPictureAlt}
      />

      <div className="flex flex-wrap gap-4">
        {full && answerMode === "both" && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idBase}-kind`} className="text-xs text-gray-500 dark:text-gray-300">
              Kind
            </label>
            <select
              id={`${idBase}-kind`}
              className={INPUT_CLS}
              value={question.kind}
              onChange={(e) => onChange(setKind(question, e.target.value as ExamQuestionKind))}
            >
              <option value="single">One correct answer</option>
              <option value="multiple">Several correct answers</option>
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idBase}-points`} className="text-xs text-gray-500 dark:text-gray-300">
            Points
          </label>
          <input
            id={`${idBase}-points`}
            type="number"
            inputMode="decimal"
            min={EXAM_LIMITS.minPoints}
            max={EXAM_LIMITS.maxPoints}
            step={EXAM_LIMITS.pointsStep}
            disabled={!full}
            value={Number.isFinite(question.points) ? question.points : ""}
            onChange={(e) => onChange({ ...question, points: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
            className={`${INPUT_CLS} w-28`}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-gray-500 dark:text-gray-300">
          Options — tick the correct {multiple ? "answers (at least two)" : "answer"}
        </legend>
        {question.options.map((option, optionIndex) => {
          const letter = String.fromCharCode(65 + optionIndex);
          const checked = question.correct.includes(option.id);
          return (
            <div key={option.id} className="flex items-center gap-2">
              <input
                type={multiple ? "checkbox" : "radio"}
                name={`${idBase}-correct`}
                checked={checked}
                disabled={!canMark}
                onChange={() => onChange(toggleCorrect(question, option.id))}
                aria-label={`Option ${letter} is correct`}
                className="h-4 w-4 shrink-0"
              />
              <span className="w-5 shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400" aria-hidden="true">
                {letter}
              </span>
              <input
                type="text"
                maxLength={EXAM_LIMITS.optionTextMax}
                disabled={!full}
                value={option.text}
                onChange={(e) => onChange(setOptionText(question, option.id, e.target.value))}
                aria-label={`Option ${letter} text`}
                className={INPUT_CLS}
              />
              {full && (
                <button
                  type="button"
                  className={ICON_BTN}
                  onClick={() => onChange(removeOption(question, option.id))}
                  disabled={question.options.length <= EXAM_LIMITS.minOptions}
                  aria-label={`Remove option ${letter}`}
                  title="Remove option"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
        {full && question.options.length < EXAM_LIMITS.maxOptions && (
          <button
            type="button"
            onClick={() => onChange(addOption(question))}
            className="flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-900/20"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add option
          </button>
        )}
      </fieldset>

      {issues.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-300" aria-label={`To fix in question ${n}`}>
          {issues.map((issue) => (
            <li key={`${issue.code}-${issue.message}`}>{issue.message.replace(/^Question \d+: /, "")}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
