import { SECONDARY_BUTTON_CLS, PRIMARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { ADVANCE_HINT, submitHint } from "@/lib/examTakeLogic";

// Previous, Next and Submit with what they wait for (EXAMS_FEATURE_SPEC.md §4.5). In the page ("inline") they end the
// screen as they always have. In the carousel layout ("bar") they sit in a bar that sticks to the bottom of the scrolling
// area, so they are always in reach: Previous, Questions (opens the list of questions, with how many are not answered) and
// Next, which on the last question is Submit. Sticky, not fixed: the persistent sidebar of a tablet and the dashboard's own
// scrolling area stay as they are. The padding at the foot keeps the buttons clear of a phone's home indicator.
export default function ExamBottomBar({
  variant,
  index,
  last,
  forwardOnly,
  timeUp,
  waitingForAnswer,
  unanswered,
  onSelect,
  onSubmit,
  onOpenQuestions,
  hideSubmit = false,
}: {
  variant: "inline" | "bar";
  index: number;
  /** The index of the last question. */
  last: number;
  forwardOnly: boolean;
  timeUp: boolean;
  /** A forward-only exam waits for an answer to this question before Next. */
  waitingForAnswer: boolean;
  unanswered: number;
  onSelect: (index: number) => void;
  onSubmit: () => void;
  /** The bar's Questions button; only the "bar" variant has one. */
  onOpenQuestions?: () => void;
  /** The staff preview has no Submit: on the last question the bar keeps a Next that is off. */
  hideSubmit?: boolean;
}) {
  const advanceHint = waitingForAnswer && (
    <p id="advance-hint" className="text-xs text-gray-500 dark:text-gray-400">
      {ADVANCE_HINT}
    </p>
  );
  const submitButton = (extra: string) => (
    <button
      type="button"
      onClick={onSubmit}
      disabled={unanswered > 0 || timeUp}
      aria-describedby={unanswered > 0 ? "submit-hint" : undefined}
      className={PRIMARY_BUTTON_CLS + extra}
      style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
    >
      Submit exam
    </button>
  );
  const sendHint = (align: string) =>
    unanswered > 0 && (
      <p id="submit-hint" className={`${align} text-xs text-gray-500 dark:text-gray-400`}>
        {submitHint(unanswered)}
      </p>
    );
  const previous = (extra: string) => (
    <button type="button" className={SECONDARY_BUTTON_CLS + extra} disabled={timeUp || forwardOnly || index === 0} onClick={() => onSelect(index - 1)}>
      Previous
    </button>
  );
  const next = (extra: string) => (
    <button
      type="button"
      className={SECONDARY_BUTTON_CLS + extra}
      disabled={timeUp || index >= last || waitingForAnswer}
      aria-describedby={waitingForAnswer ? "advance-hint" : undefined}
      onClick={() => onSelect(index + 1)}
    >
      Next
    </button>
  );

  if (variant === "inline") {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {previous("")}
            {next("")}
          </div>
          {submitButton("")}
        </div>
        {advanceHint}
        {sendHint("text-right")}
      </>
    );
  }

  const onLast = index >= last && !hideSubmit;
  const grow = " min-h-11 flex-1 justify-center";
  return (
    <div className="sticky bottom-0 z-30 flex flex-col gap-1 border-t border-gray-200 bg-white px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-gray-700 dark:bg-gray-800">
      {advanceHint}
      {onLast && sendHint("text-center")}
      <div className="flex items-center gap-2">
        {previous(grow)}
        <button
          type="button"
          className={SECONDARY_BUTTON_CLS + grow}
          aria-label={unanswered > 0 ? `Questions, ${unanswered} not answered` : "Questions, all answered"}
          onClick={onOpenQuestions}
        >
          Questions
          {unanswered > 0 && (
            <span aria-hidden="true" className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              {unanswered}
            </span>
          )}
        </button>
        {onLast ? submitButton(grow) : next(grow)}
      </div>
    </div>
  );
}
