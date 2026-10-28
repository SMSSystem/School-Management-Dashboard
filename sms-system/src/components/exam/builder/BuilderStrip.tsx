import { Plus } from "lucide-react";
import { positionText } from "@/lib/examCarousel";
import { EXAM_LIMITS } from "@/types/exams";
import { SECONDARY_BUTTON_CLS } from "./builderStyles";

// The strip above the question being edited (the builder shows one question at a time): where the editor is in the list
// ("Question 3 of 20"), Previous and Next, and, when the exam can still be edited, Add question, always within reach. It
// sticks to the top of the scrolling area, so a long question can be scrolled without losing the way to the next one. The
// background is opaque so the editor never shows through; the buttons are 44 px below `md`, for a finger.
export default function BuilderStrip({
  index,
  total,
  canAdd,
  onPrevious,
  onNext,
  onAdd,
  trailing,
}: {
  index: number;
  total: number;
  /** The exam can still have questions added (full edit mode). */
  canAdd: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onAdd: () => void;
  /** More controls at the end of the strip (the phone's Questions button). */
  trailing?: React.ReactNode;
}) {
  const touch = " min-h-11 md:min-h-0";
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white py-2 dark:border-gray-700 dark:bg-gray-800">
      {total > 0 && (
        <>
          <button type="button" className={SECONDARY_BUTTON_CLS + touch} disabled={index <= 0} onClick={onPrevious}>
            Previous
          </button>
          <p className="min-w-0 flex-1 text-center text-sm font-medium" aria-live="polite">
            {positionText(index, total)}
          </p>
          <button type="button" className={SECONDARY_BUTTON_CLS + touch} disabled={index >= total - 1} onClick={onNext}>
            Next
          </button>
        </>
      )}
      {trailing}
      {canAdd && (
        <button
          type="button"
          disabled={total >= EXAM_LIMITS.maxQuestions}
          onClick={onAdd}
          className={`${SECONDARY_BUTTON_CLS}${touch} text-sky-700 dark:text-sky-300`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add question
        </button>
      )}
    </div>
  );
}
