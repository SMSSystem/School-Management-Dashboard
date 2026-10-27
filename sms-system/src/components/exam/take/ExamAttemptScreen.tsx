import { useKeepAliveWhileOpen } from "@/hooks/useKeepAliveWhileOpen";
import { useQuestionDeterrents } from "@/hooks/useQuestionDeterrents";
import { useFullscreen } from "@/hooks/useFullscreen";
import { CAROUSEL_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { answeredCount, canAdvance, navigatorState, unansweredCount } from "@/lib/examTakeLogic";
import { stripText } from "@/lib/examCarousel";
import { saveRole, visibleSaveText, type SaveState } from "@/lib/examSaveStatus";
import type { ExamQuestion } from "@/types/exams";
import type { ExamPictures } from "@/hooks/useExamPictures";
import ExamTimer from "./ExamTimer";
import ExamStickyHeader from "./ExamStickyHeader";
import ExamBottomBar from "./ExamBottomBar";
import TimesUpBanner from "./TimesUpBanner";
import QuestionNavigator from "./QuestionNavigator";
import StudentQuestionView from "./StudentQuestionView";
import ExamWatermark from "./ExamWatermark";
import { WatermarkContext } from "./examWatermarkContext";

// The attempt itself (EXAMS_FEATURE_SPEC.md §4.5): the countdown, "Answered N of M", the navigator, one question at a
// time with Previous and Next, and Submit. It holds no answers of its own; useRunningAttempt does. While it is on
// screen the student counts as active for the length of the exam plus ten minutes, so reading a long question does not
// end in an inactivity sign-out. In the carousel layout (a phone, or a tablet held upright) the countdown and the buttons
// sit in bars that stick to the top and the bottom of the scrolling area; only one of the two layouts is ever mounted, so
// there is one timer.
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
  carouselLayout,
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
  /** Overrides the window-size check that picks the carousel layout (for a test); the screen leaves it out. */
  carouselLayout?: boolean;
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
  const windowIsCarousel = useMediaQuery(CAROUSEL_QUERY);
  const carousel = carouselLayout ?? windowIsCarousel;
  const saveText = visibleSaveText(saveState, carousel);
  const unanswered = unansweredCount(questions, answers);
  // At 00:00 the answers are fixed while the automatic submit runs or is retried.
  const timeUp = remainingMs <= 0;
  const last = questions.length - 1;
  // A forward-only exam does not let the student move on from a question they have not answered.
  const waitingForAnswer = forwardOnly && index < last && !canAdvance(question, answers, true);

  const fullscreenNote = unsupervised && fullscreen.supported && !fullscreen.active && (
    <div role="note" className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <span>This exam asks you to use fullscreen. Leaving it is recorded; nothing stops you.</span>
      <button type="button" className={SECONDARY_BUTTON_CLS} onClick={() => void fullscreen.enter()}>
        Return to fullscreen
      </button>
    </div>
  );

  const navigator = (
    <QuestionNavigator
      items={items}
      currentId={question?.id}
      forwardOnly={forwardOnly}
      disabled={timeUp}
      onSelect={(id) => onSelect(questions.findIndex((q) => q.id === id))}
    />
  );

  // The question area: copying, the context menu, dragging and selecting are switched off, and the questions do not print
  // (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.5). Nothing is hidden from assistive technology and no focus is changed.
  const paperArea = (
    <>
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
    </>
  );

  const notes = (
    <>
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
    </>
  );

  const buttons = (variant: "inline" | "bar") => (
    <ExamBottomBar
      variant={variant}
      index={index}
      last={last}
      forwardOnly={forwardOnly}
      timeUp={timeUp}
      waitingForAnswer={waitingForAnswer}
      unanswered={unanswered}
      onSelect={onSelect}
      onSubmit={onSubmit}
    />
  );

  if (carousel) {
    return (
      <div data-exam-attempt className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-white dark:bg-gray-800">
        <ExamStickyHeader
          title={title}
          subtitle={subtitle}
          remainingMs={remainingMs}
          position={stripText(index, questions.length, answeredCount(questions, answers))}
          saveText={saveText}
          saveRole={saveRole(saveState)}
          timeUp={timeUp}
          sendingFailed={error !== null}
        />
        <div className="flex flex-1 flex-col gap-4 p-4">
          {fullscreenNote}
          {navigator}
          {paperArea}
          {notes}
        </div>
        {buttons("bar")}
      </div>
    );
  }

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

      {fullscreenNote}
      {navigator}
      {paperArea}
      {notes}
      {buttons("inline")}
    </div>
  );
}
