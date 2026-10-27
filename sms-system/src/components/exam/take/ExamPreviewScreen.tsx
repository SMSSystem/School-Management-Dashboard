import { useEffect, useState } from "react";
import { CAROUSEL_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { answeredCount, isForwardOnly, navigatorState, unansweredCount } from "@/lib/examTakeLogic";
import { stripText, swipeTarget, type SwipeDirection } from "@/lib/examCarousel";
import { millisOf } from "@/lib/examListLogic";
import { formatExamWindow, jamaicaTimeNote } from "@/lib/examDateTime";
import type { ExamDocument, ExamQuestion, ExamQuestionImage } from "@/types/exams";
import CarouselFrame from "./CarouselFrame";
import ExamBottomBar from "./ExamBottomBar";
import ExamStickyHeader from "./ExamStickyHeader";
import QuestionNavigator from "./QuestionNavigator";
import QuestionSheet from "./QuestionSheet";
import QuestionSlide from "./QuestionSlide";
import StudentQuestionView from "./StudentQuestionView";

// Preview as student (EXAMS_FEATURE_SPEC.md §4.7), as the page draws it: the exam as a student sees it, one question at a
// time, for staff. It mirrors the student's screen by window size: in the carousel layout (a phone, or a tablet held upright)
// it has the same bars, list of questions, swipe and slide as the attempt, without a clock and without Submit; otherwise it
// is the page it always was. The answers and flags live in the page and nothing is saved.
export type PreviewScreenExam = ExamDocument & { id: string };

export default function ExamPreviewScreen({
  exam,
  questions,
  back,
  current,
  answers,
  flags,
  srcOf,
  carouselLayout,
  onSelect,
  onToggleOption,
  onToggleFlag,
  onShuffle,
  onClear,
}: {
  exam: PreviewScreenExam;
  questions: readonly ExamQuestion[];
  /** The link back to the builder or the list. */
  back: React.ReactNode;
  current: number;
  answers: Readonly<Record<string, readonly string[]>>;
  flags: readonly string[];
  /** The loaded picture of a question, or nothing. */
  srcOf: (image: ExamQuestionImage) => string | undefined;
  /** Overrides the window-size check that picks the carousel layout (for a test); the page leaves it out. */
  carouselLayout?: boolean;
  onSelect: (index: number) => void;
  onToggleOption: (question: ExamQuestion, optionId: string) => void;
  onToggleFlag: (questionId: string) => void;
  onShuffle: () => void;
  onClear: () => void;
}) {
  const windowIsCarousel = useMediaQuery(CAROUSEL_QUERY);
  const carousel = (carouselLayout ?? windowIsCarousel) && questions.length > 0;
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (!carousel) setSheetOpen(false);
  }, [carousel]);

  const index = Math.min(current, Math.max(questions.length - 1, 0));
  const question = questions[index];
  const items = navigatorState(questions, answers, flags);
  const unanswered = unansweredCount(questions, answers);
  const last = questions.length - 1;
  const shuffles = exam.shuffle !== false;

  const note = (
    <p role="note" className="rounded-md bg-violet-50 p-3 text-sm font-medium text-violet-800 dark:bg-violet-900/20 dark:text-violet-200">
      Preview — nothing is saved. This is how a student sees the exam. A student also has a countdown timer and a Submit
      button here.
    </p>
  );
  const forwardNote = isForwardOnly(exam) && (
    <p role="note" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      This exam is forward only: a student moves to the next question and cannot go back. In this preview you can move freely.
    </p>
  );
  const meta = (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {[exam.className, exam.subjectName].filter(Boolean).join(" · ")}
        {exam.duration ? ` · ${exam.duration} minutes` : ""} · {formatExamWindow(millisOf(exam.opensAt), millisOf(exam.closesAt))}
      </p>
      {jamaicaTimeNote() && <p className="text-xs text-gray-500 dark:text-gray-400">{jamaicaTimeNote()}</p>}
    </>
  );

  const questionView = question && (
    <StudentQuestionView
      question={question}
      number={index + 1}
      total={questions.length}
      chosen={answers[question.id] ?? []}
      flagged={flags.includes(question.id)}
      onToggleOption={(optionId) => onToggleOption(question, optionId)}
      onToggleFlag={() => onToggleFlag(question.id)}
      picture={
        question.image
          ? { state: srcOf(question.image) ? "ready" : "failed", src: srcOf(question.image), onRetry: () => window.location.reload() }
          : undefined
      }
    />
  );

  if (carousel) {
    // A preview moves freely, whatever the exam says about going back.
    const swipe = (direction: SwipeDirection) => {
      const target = swipeTarget(direction, { index, total: questions.length, forwardOnly: false, currentAnswered: true });
      if (target !== null) onSelect(target);
    };
    return (
      <CarouselFrame
        kind="preview"
        header={
          <ExamStickyHeader
            title={exam.title || "Untitled exam"}
            subtitle={[exam.className, exam.subjectName].filter(Boolean).join(" · ")}
            position={stripText(index, questions.length, answeredCount(questions, answers))}
            saveText={null}
            saveRole={undefined}
            timeUp={false}
            sendingFailed={false}
          />
        }
        index={index}
        total={questions.length}
        swipeEnabled
        onSwipe={swipe}
        bar={
          <ExamBottomBar
            variant="bar"
            index={index}
            last={last}
            forwardOnly={false}
            timeUp={false}
            waitingForAnswer={false}
            unanswered={unanswered}
            onSelect={onSelect}
            onSubmit={() => undefined}
            onOpenQuestions={() => setSheetOpen(true)}
            hideSubmit
          />
        }
        sheet={
          sheetOpen && (
            <QuestionSheet
              items={items}
              currentId={question?.id}
              forwardOnly={false}
              timeUp={false}
              unanswered={unanswered}
              onSelect={(id) => onSelect(questions.findIndex((q) => q.id === id))}
              onSubmit={() => undefined}
              onClose={() => setSheetOpen(false)}
              showSubmit={false}
              tools={
                <>
                  {shuffles && (
                    <button
                      type="button"
                      className={SECONDARY_BUTTON_CLS}
                      onClick={() => {
                        onShuffle();
                        setSheetOpen(false);
                      }}
                    >
                      Shuffle again
                    </button>
                  )}
                  <button
                    type="button"
                    className={SECONDARY_BUTTON_CLS}
                    onClick={() => {
                      onClear();
                      setSheetOpen(false);
                    }}
                  >
                    Clear my answers
                  </button>
                </>
              }
            />
          )
        }
      >
        {back}
        {note}
        {forwardNote}
        <div>{meta}</div>
        {question && <QuestionSlide id={question.id} index={index}>{questionView}</QuestionSlide>}
      </CarouselFrame>
    );
  }

  return (
    <div className="m-4 flex flex-1 flex-col gap-4 rounded-md bg-white p-4 dark:bg-gray-800">
      {back}
      {note}

      {forwardNote}

      <div>
        <h1 className="text-lg font-semibold">{exam.title || "Untitled exam"}</h1>
        {meta}
      </div>

      {questions.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">This exam has no questions yet. Add some in the builder.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium" aria-live="polite">
              Answered {answeredCount(questions, answers)} of {questions.length}
            </p>
            <div className="flex gap-2">
              {shuffles && (
                <button type="button" className={SECONDARY_BUTTON_CLS} onClick={onShuffle}>
                  Shuffle again
                </button>
              )}
              <button type="button" className={SECONDARY_BUTTON_CLS} onClick={onClear}>
                Clear my answers
              </button>
            </div>
          </div>

          <QuestionNavigator items={items} currentId={question?.id} onSelect={(id) => onSelect(questions.findIndex((q) => q.id === id))} />

          {questionView}

          <div className="flex justify-between">
            <button type="button" className={SECONDARY_BUTTON_CLS} disabled={index === 0} onClick={() => onSelect(index - 1)}>
              Previous
            </button>
            <button type="button" className={SECONDARY_BUTTON_CLS} disabled={index >= last} onClick={() => onSelect(index + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
