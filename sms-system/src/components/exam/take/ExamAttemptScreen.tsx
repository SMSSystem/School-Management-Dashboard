import { useKeepAliveWhileOpen } from "@/hooks/useKeepAliveWhileOpen";
import { useQuestionDeterrents } from "@/hooks/useQuestionDeterrents";
import { SECONDARY_BUTTON_CLS, PRIMARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { answeredCount, navigatorState } from "@/lib/examTakeLogic";
import type { ExamQuestion } from "@/types/exams";
import type { ExamPictures } from "@/hooks/useExamPictures";
import ExamTimer from "./ExamTimer";
import QuestionNavigator from "./QuestionNavigator";
import StudentQuestionView from "./StudentQuestionView";

// The attempt itself (EXAMS_FEATURE_SPEC.md §4.5): the countdown, "Answered N of M", the navigator, one question at a
// time with Previous and Next, and Submit. It holds no answers of its own; useRunningAttempt does. While it is on
// screen the student counts as active for the length of the exam plus ten minutes, so reading a long question does not
// end in an inactivity sign-out.
export default function ExamAttemptScreen({
  title,
  subtitle,
  remainingMs,
  questions,
  answers,
  flags,
  current,
  saveStatus,
  keepAliveCapMs,
  error,
  pictures,
  onSelect,
  onToggleOption,
  onToggleFlag,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  remainingMs: number;
  questions: readonly ExamQuestion[];
  answers: Readonly<Record<string, readonly string[]>>;
  flags: readonly string[];
  current: number;
  saveStatus: string;
  keepAliveCapMs: number;
  error: string | null;
  /** The pictures of the questions, read in the background (an exam without pictures reads none). */
  pictures: ExamPictures;
  onSelect: (index: number) => void;
  onToggleOption: (questionId: string, optionId: string) => void;
  onToggleFlag: (questionId: string) => void;
  onSubmit: () => void;
}) {
  useKeepAliveWhileOpen(keepAliveCapMs);
  const paper = useQuestionDeterrents<HTMLDivElement>();
  const index = Math.min(current, Math.max(questions.length - 1, 0));
  const question = questions[index];
  const items = navigatorState(questions, answers, flags);

  return (
    <div className="m-4 flex flex-1 flex-col gap-4 rounded-md bg-white p-4 dark:bg-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
        <ExamTimer remainingMs={remainingMs} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-medium" aria-live="polite">
          Answered {answeredCount(questions, answers)} of {questions.length}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{saveStatus}</p>
      </div>

      <QuestionNavigator items={items} currentId={question?.id} onSelect={(id) => onSelect(questions.findIndex((q) => q.id === id))} />

      {/* The question area: copying, the context menu, dragging and selecting are switched off, and the questions do not print
          (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.5). Nothing is hidden from assistive technology and no focus is changed. */}
      <div ref={paper} className="select-none [-webkit-touch-callout:none] print:hidden">
        {question && (
          <StudentQuestionView
            question={question}
            number={index + 1}
            total={questions.length}
            chosen={answers[question.id] ?? []}
            flagged={flags.includes(question.id)}
            onToggleOption={(optionId) => onToggleOption(question.id, optionId)}
            onToggleFlag={() => onToggleFlag(question.id)}
            picture={
              question.image
                ? { state: pictures.stateOf(question.image), src: pictures.srcOf(question.image), onRetry: () => pictures.retry(question.image!.pack) }
                : undefined
            }
          />
        )}
      </div>
      <p className="hidden print:block">Printing the questions is switched off.</p>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" className={SECONDARY_BUTTON_CLS} disabled={index === 0} onClick={() => onSelect(index - 1)}>
            Previous
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLS} disabled={index >= questions.length - 1} onClick={() => onSelect(index + 1)}>
            Next
          </button>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          className={PRIMARY_BUTTON_CLS}
          style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        >
          Submit exam
        </button>
      </div>
    </div>
  );
}
