import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import QuestionSlide from "@/components/exam/take/QuestionSlide";
import { useSwipe } from "@/hooks/useSwipe";
import type { SwipeDirection } from "@/lib/examCarousel";
import { clampIndex } from "@/lib/examCarousel";
import {
  criterionPositionText,
  directionFromKey,
  stepCriterion,
} from "@/lib/rubricCarousel";
import type { RubricCriterion } from "@/types/assessment";

const STEP_BTN_CLS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 dark:aria-disabled:hover:bg-transparent";

const Criterion = ({ criterion }: { criterion: RubricCriterion }) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-gray-100">
        {criterion.name}
      </h3>
      <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-gray-400">
        {criterion.maxPoints} pt{criterion.maxPoints === 1 ? "" : "s"} max
      </span>
    </div>
    <div className="flex flex-col gap-2">
      {criterion.levels.length === 0 && (
        <p className="text-xs italic text-slate-500 dark:text-gray-400">
          No levels. Marked out of {criterion.maxPoints}.
        </p>
      )}
      {criterion.levels.map((level, i) => (
        <div
          key={i}
          className="flex flex-col gap-0.5 rounded-md bg-slate-50 px-3 py-2 dark:bg-gray-900/40"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-800 dark:text-gray-200">
              {level.label}
            </span>
            <span className="shrink-0 text-xs text-slate-500 dark:text-gray-400">
              {level.points} pt{level.points === 1 ? "" : "s"}
            </span>
          </div>
          {level.description && (
            <p className="text-xs text-slate-500 dark:text-gray-400">
              {level.description}
            </p>
          )}
        </div>
      ))}
    </div>
  </div>
);

// Previous, the jump list, Next and the position line. Used only when there is more than one criterion.
const Controls = ({
  criteria,
  at,
  position,
  onStep,
  onJump,
}: {
  criteria: RubricCriterion[];
  at: number;
  position: string;
  onStep: (direction: SwipeDirection) => void;
  onJump: (index: number) => void;
}) => (
  <>
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={STEP_BTN_CLS}
        aria-label="Previous criterion"
        title="Previous criterion"
        aria-disabled={at === 0}
        onClick={() => onStep("prev")}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <select
        aria-label="Jump to a criterion"
        value={at}
        onChange={(e) => onJump(Number(e.target.value))}
        className="h-11 min-w-0 flex-1 rounded-md p-2 text-sm ring-[1.5px] ring-gray-300 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-600"
      >
        {criteria.map((c, i) => (
          <option key={c.id} value={i}>
            {i + 1}. {c.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={STEP_BTN_CLS}
        aria-label="Next criterion"
        title="Next criterion"
        aria-disabled={at === criteria.length - 1}
        onClick={() => onStep("next")}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
    <p
      className="text-center text-xs text-slate-500 dark:text-gray-400"
      aria-hidden="true"
    >
      {position}
    </p>
  </>
);

// One criterion of a rubric at a time, so a long rubric needs no long scroll (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md
// section 6). Used by the view dialog and the assignment page, at every screen size. It moves by the buttons, the jump list,
// the arrow keys while focus is inside it, and a sideways swipe; it never rotates by itself and stops at each end.
//
// Following the WAI-ARIA carousel pattern, pressing a button leaves the focus on it, so it can be pressed again (the exam
// carousel moves the focus to the new question instead). The ends use aria-disabled, not disabled, because a disabled
// button would drop the focus. The box has a fixed height and the controls sit under it, so they stay put from one
// criterion to the next, and a long criterion scrolls inside the box, which is why the box can take the focus.
export default function RubricCarousel({
  criteria,
  label,
}: {
  criteria: RubricCriterion[];
  label: string;
}) {
  const total = criteria.length;
  const [index, setIndex] = useState(0);
  const [moved, setMoved] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // A live update can remove criteria while this is open.
  const at = clampIndex(index, total);
  const several = total > 1;

  const goTo = (target: number) => {
    setIndex(target);
    setMoved(true);
    if (box.current) box.current.scrollTop = 0;
  };
  const step = (direction: SwipeDirection) => {
    const target = stepCriterion(at, total, direction);
    if (target !== null) goTo(target);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    // The jump list uses the arrow keys itself.
    if (e.target instanceof HTMLSelectElement) return;
    const direction = directionFromKey(e.key);
    if (direction) step(direction);
  };
  // A touch here is inside the view dialog on the Rubrics page, which the hook ignores unless told otherwise.
  const swipeRef = useSwipe<HTMLDivElement>(step, several, {
    insideDialog: true,
  });

  if (total === 0)
    return (
      <p className="text-sm italic text-gray-400">
        This rubric has no criteria yet.
      </p>
    );

  const criterion = criteria[at];
  const position = criterionPositionText(at, total);
  const slideLabel = `${position}: ${criterion.name}`;

  return (
    <div
      ref={swipeRef}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      className="flex touch-pan-y flex-col gap-3"
      onKeyDown={onKeyDown}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {moved ? slideLabel : ""}
      </p>
      <div
        ref={box}
        role="group"
        aria-roledescription="slide"
        aria-label={slideLabel}
        tabIndex={0}
        className={`overflow-x-hidden overflow-y-auto rounded-lg border border-slate-200 p-4 dark:border-gray-700 ${
          several ? "h-[min(55dvh,26rem)]" : "max-h-[55dvh]"
        }`}
      >
        <QuestionSlide id={`${at}:${criterion.id}`} index={at}>
          <Criterion criterion={criterion} />
        </QuestionSlide>
      </div>
      {several && (
        <Controls
          criteria={criteria}
          at={at}
          position={position}
          onStep={step}
          onJump={goTo}
        />
      )}
    </div>
  );
}
