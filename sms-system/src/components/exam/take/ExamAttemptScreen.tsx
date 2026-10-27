import { useKeepAliveWhileOpen } from "@/hooks/useKeepAliveWhileOpen";
import { useQuestionDeterrents } from "@/hooks/useQuestionDeterrents";
import { useFullscreen } from "@/hooks/useFullscreen";
import { CAROUSEL_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { SECONDARY_BUTTON_CLS, PRIMARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { ADVANCE_HINT, answeredCount, canAdvance, navigatorState, submitHint, unansweredCount } from "@/lib/examTakeLogic";
import { saveRole, visibleSaveText, type SaveState } from "@/lib/examSaveStatus";
import type { ExamQuestion } from "@/types/exams";
import type { ExamPictures } from "@/hooks/useExamPictures";
import ExamTimer from "./ExamTimer";
import TimesUpBanner from "./TimesUpBanner";
import QuestionNavigator from "./QuestionNavigator";
import StudentQuestionView from "./StudentQuestionView";
import ExamWatermark from "./ExamWatermark";
import { WatermarkContext } from "./examWatermarkContext";

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
  saveState,
  keepAliveCapMs,
  error,
  pictures,
  unsupervised,
  watermark,
  forwardOnly = false,
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
  saveState: SaveState;
  keepAliveCapMs: number;
  error: string | null;
  /** The pictures of the questions, read in the background (an exam without pictures reads none). */
  pictures: ExamPictures;
  /** An unsupervised exam: it asks for fullscreen and marks the paper with the student's name. */
  unsupervised: boolean;
  /** The words of the watermark (the student's name and a short code); only shown when `unsupervised`. */
  watermark: string;
  /** A forward-only exam: Previous and the numbered buttons are off, and Next goes one question on. */
  forwardOnly?: boolean;
  onSelect: (index: number) => void;
  onToggleOption: (questionId: string, optionId: string) => void;
  onToggleFlag: (questionId: string) => void;
  onSubmit: () => void;
}) {
  useKeepAliveWhileOpen(keepAliveCapMs);
  const paper = useQuestionDeterrents<HTMLDivElement>();
  const fullscreen = useFullscreen();
  const index = Math.min(current, Math.max(questions.length - 1, 0));
  const question = questions[index];
  const items = navigatorState(questions, answers, flags);
  const carousel = useMediaQuery(CAROUSEL_QUERY);
  const saveText = visibleSaveText(saveState, carousel);
  const unanswered = unansweredCount(questions, answers);
  // At 00:00 the answers are fixed while the automatic submit runs or is retried.
  const timeUp = remainingMs <= 0;
  const last = questions.length - 1;
  // A forward-only exam does not let the student move on from a question they have not answered.
  const waitingForAnswer = forwardOnly && index < last && !canAdvance(question, answers, true);

  return (
    <div className="m-4 flex flex-1 flex-col gap-4 rounded-md bg-white p-4 dark:bg-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
        <ExamTimer remainingMs={remainingMs} />
      </div>

      {timeUp && <TimesUpBanner sendingFailed={error !== null} />}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-medium" aria-live="polite">
          Answered {answeredCount(questions, answers)} of {questions.length}
        </p>
        {saveText && (
          <p role={saveRole(saveState)} className="text-xs text-gray-500 dark:text-gray-400">
            {saveText}
          </p>
        )}
      </div>

      {unsupervised && fullscreen.supported && !fullscreen.active && (
        <div role="note" className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <span>This exam asks you to use fullscreen. Leaving it is recorded; nothing stops you.</span>
          <button type="button" className={SECONDARY_BUTTON_CLS} onClick={() => void fullscreen.enter()}>
            Return to fullscreen
          </button>
        </div>
      )}

      <QuestionNavigator
        items={items}
        currentId={question?.id}
        forwardOnly={forwardOnly}
        disabled={timeUp}
        onSelect={(id) => onSelect(questions.findIndex((q) => q.id === id))}
      />

      {/* The question area: copying, the context menu, dragging and selecting are switched off, and the questions do not print
          (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.5). Nothing is hidden from assistive technology and no focus is changed. */}
      <WatermarkContext.Provider value={unsupervised ? watermark : null}>
      <div ref={paper} className="relative select-none [-webkit-touch-callout:none] print:hidden">
        <ExamWatermark />
        {question && (
          <StudentQuestionView
            question={question}
            number={index + 1}
            total={questions.length}
            chosen={answers[question.id] ?? []}
            flagged={flags.includes(question.id)}
            disabled={timeUp}
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
      </WatermarkContext.Provider>
      <p className="hidden print:block">Printing the questions is switched off.</p>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {forwardOnly && (
        <p role="note" className="text-xs text-gray-500 dark:text-gray-400">
          Once you move to the next question you cannot come back to this one.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" className={SECONDARY_BUTTON_CLS} disabled={timeUp || forwardOnly || index === 0} onClick={() => onSelect(index - 1)}>
            Previous
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLS}
            disabled={timeUp || index >= last || waitingForAnswer}
            aria-describedby={waitingForAnswer ? "advance-hint" : undefined}
            onClick={() => onSelect(index + 1)}
          >
            Next
          </button>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={unanswered > 0 || timeUp}
          aria-describedby={unanswered > 0 ? "submit-hint" : undefined}
          className={PRIMARY_BUTTON_CLS}
          style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        >
          Submit exam
        </button>
      </div>
      {waitingForAnswer && (
        <p id="advance-hint" className="text-xs text-gray-500 dark:text-gray-400">
          {ADVANCE_HINT}
        </p>
      )}
      {unanswered > 0 && (
        <p id="submit-hint" className="text-right text-xs text-gray-500 dark:text-gray-400">
          {submitHint(unanswered)}
        </p>
      )}
    </div>
  );
}
