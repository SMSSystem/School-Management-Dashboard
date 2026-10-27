import { SECONDARY_BUTTON_CLS, PRIMARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { ADVANCE_HINT, submitHint } from "@/lib/examTakeLogic";

// Previous, Next and Submit with what they wait for (EXAMS_FEATURE_SPEC.md §4.5). In the page ("inline") they end the
// screen as they always have; in the carousel layout ("bar") they sit in a bar that sticks to the bottom of the scrolling
// area, so they are always in reach. Sticky, not fixed: the persistent sidebar of a tablet and the dashboard's own
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
}) {
  const bar = variant === "bar";
  const touch = bar ? " min-h-11" : "";

  const advanceHint = waitingForAnswer && (
    <p id="advance-hint" className="text-xs text-gray-500 dark:text-gray-400">
      {ADVANCE_HINT}
    </p>
  );
  const sendHint = unanswered > 0 && (
    <p id="submit-hint" className="text-right text-xs text-gray-500 dark:text-gray-400">
      {submitHint(unanswered)}
    </p>
  );
  const buttons = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2">
        <button type="button" className={SECONDARY_BUTTON_CLS + touch} disabled={timeUp || forwardOnly || index === 0} onClick={() => onSelect(index - 1)}>
          Previous
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON_CLS + touch}
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
        className={PRIMARY_BUTTON_CLS + touch}
        style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
      >
        Submit exam
      </button>
    </div>
  );

  if (!bar) {
    return (
      <>
        {buttons}
        {advanceHint}
        {sendHint}
      </>
    );
  }
  return (
    <div className="sticky bottom-0 z-30 flex flex-col gap-1 border-t border-gray-200 bg-white px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-gray-700 dark:bg-gray-800">
      {advanceHint}
      {sendHint}
      {buttons}
    </div>
  );
}
